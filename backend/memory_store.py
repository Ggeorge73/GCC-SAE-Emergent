"""In-process stand-in for the subset of Motor used by Law Suite.

Selected with MONGO_URL=memory for tests, browser journeys and local demos.
Data lives only in this process and is lost on restart; never use it for real records.
"""
import copy
import itertools

from pymongo.errors import DuplicateKeyError


def _values(row, key):
    value = row
    for part in key.split("."):
        if not isinstance(value, dict) or part not in value:
            return []
        value = value[part]
    return value if isinstance(value, list) else [value]


def _matches(row, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(row, option) for option in expected):
                return False
            continue
        values = _values(row, key)
        if isinstance(expected, dict) and any(op.startswith("$") for op in expected):
            for op, operand in expected.items():
                if op == "$in" and not any(v in operand for v in values):
                    return False
                if op == "$nin" and any(v in operand for v in values):
                    return False
                if op == "$ne" and operand in values:
                    return False
                if op == "$exists" and bool(values) != operand:
                    return False
                if op == "$gt" and not any(v > operand for v in values):
                    return False
                if op == "$lt" and not any(v < operand for v in values):
                    return False
        elif expected not in values:
            return False
    return True


def _project(row, projection):
    row = copy.deepcopy(row)
    if projection:
        for key, include in projection.items():
            if not include:
                row.pop(key, None)
    return row


class Cursor:
    def __init__(self, rows, projection):
        self._rows = rows
        self._projection = projection

    def sort(self, key, direction=1):
        self._rows.sort(key=lambda r: (r.get(key) is None, r.get(key)), reverse=direction < 0)
        return self

    def limit(self, count):
        self._rows = self._rows[:count] if count else self._rows
        return self

    async def to_list(self, length=None):
        rows = self._rows[:length] if length else self._rows
        return [_project(r, self._projection) for r in rows]


class Collection:
    def __init__(self):
        self.rows = []
        self.unique = []
        self._ids = itertools.count(1)

    async def create_index(self, keys, unique=False, **_):
        key = keys if isinstance(keys, str) else keys[0][0]
        if unique and key not in self.unique:
            self.unique.append(key)
        return key

    def _check_unique(self, candidate, ignore=None):
        for key in self.unique:
            value = candidate.get(key)
            if value is not None and any(r is not ignore and r.get(key) == value for r in self.rows):
                raise DuplicateKeyError(f"duplicate {key}")

    async def insert_one(self, document):
        row = copy.deepcopy(document)
        row.setdefault("_id", next(self._ids))
        self._check_unique(row)
        self.rows.append(row)
        document.setdefault("_id", row["_id"])
        return type("InsertResult", (), {"inserted_id": row["_id"]})()

    async def find_one(self, query=None, projection=None, sort=None):
        rows = [r for r in self.rows if _matches(r, query or {})]
        if sort:
            key, direction = sort[0]
            rows.sort(key=lambda r: r.get(key), reverse=direction < 0)
        return _project(rows[0], projection) if rows else None

    def find(self, query=None, projection=None):
        return Cursor([r for r in self.rows if _matches(r, query or {})], projection)

    def _apply(self, row, update):
        for op, changes in update.items():
            for key, value in changes.items():
                if op == "$set":
                    row[key] = copy.deepcopy(value)
                elif op == "$inc":
                    row[key] = row.get(key, 0) + value
                elif op == "$addToSet":
                    items = row.setdefault(key, [])
                    if value not in items:
                        items.append(copy.deepcopy(value))
                elif op == "$push":
                    row.setdefault(key, []).append(copy.deepcopy(value))
                elif op == "$pull":
                    row[key] = [item for item in row.get(key, []) if item != value]
                else:
                    raise NotImplementedError(op)

    async def update_one(self, query, update, upsert=False):
        for row in self.rows:
            if _matches(row, query):
                candidate = copy.deepcopy(row)
                self._apply(candidate, update)
                self._check_unique(candidate, ignore=row)
                row.clear()
                row.update(candidate)
                return type("UpdateResult", (), {"matched_count": 1, "modified_count": 1})()
        return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0})()

    async def update_many(self, query, update):
        matched = [r for r in self.rows if _matches(r, query)]
        for row in matched:
            self._apply(row, update)
        return type("UpdateResult", (), {"matched_count": len(matched), "modified_count": len(matched)})()

    async def delete_one(self, query):
        for index, row in enumerate(self.rows):
            if _matches(row, query):
                del self.rows[index]
                return type("DeleteResult", (), {"deleted_count": 1})()
        return type("DeleteResult", (), {"deleted_count": 0})()

    async def delete_many(self, query):
        before = len(self.rows)
        self.rows = [r for r in self.rows if not _matches(r, query)]
        return type("DeleteResult", (), {"deleted_count": before - len(self.rows)})()

    async def count_documents(self, query):
        return sum(1 for r in self.rows if _matches(r, query))


class MemoryDatabase:
    """Collections are created on first attribute access, like Motor."""

    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._collections.setdefault(name, Collection())

    def __getitem__(self, name):
        return getattr(self, name)


class MemoryClient:
    def close(self):
        pass
