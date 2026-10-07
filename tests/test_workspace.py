"""Shared matters, ethical walls, tasks and invitations against the in-process store."""
import asyncio
import os
import time
import unittest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "law_suite_test_workspace")
os.environ["LAW_SUITE_AI_MODE"] = "offline"

from fastapi.testclient import TestClient
from backend import identity, server
from backend.memory_store import MemoryDatabase

PASSWORD = "correct horse battery"


class FirmFixture(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDatabase()
        asyncio.run(identity.ensure_indexes(self.db))
        server.app.dependency_overrides[identity.get_db] = lambda: self.db
        self.client = TestClient(server.app)
        self.admin = self.signup("admin@firm-a.test", "Firm A")
        self.partner = self.join(self.admin, "Pat Partner", "partner@firm-a.test", "partner")
        self.associate = self.join(self.admin, "Ash Associate", "assoc@firm-a.test", "associate")
        self.paralegal = self.join(self.admin, "Pip Paralegal", "para@firm-a.test", "paralegal")
        self.other_firm = self.signup("admin@firm-b.test", "Firm B")

    def tearDown(self):
        self.client.close()
        server.app.dependency_overrides.clear()

    def call(self, who, method, path, **kwargs):
        return getattr(self.client, method)(f"/api{path}", headers={"Authorization": f"Bearer {who['token']}"}, **kwargs)

    def signup(self, email, firm):
        body = self.client.post("/api/auth/signup", json={"firm_name": firm, "name": f"{firm} Admin", "email": email, "password": PASSWORD}).json()
        return body

    def join(self, inviter, name, email, role):
        invite = self.call(inviter, "post", "/firm/invites", json={"name": name, "email": email, "role": role})
        self.assertEqual(invite.status_code, 201, invite.text)
        joined = self.client.post("/api/auth/join", json={"code": invite.json()["code"], "password": PASSWORD})
        self.assertEqual(joined.status_code, 201, joined.text)
        return joined.json()

    def open_matter(self, who=None, name="Synthetic lease dispute"):
        response = self.call(who or self.partner, "post", "/firm/matters", json={"name": name, "client_name": "Synthetic Client Ltd"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def ids(self, who):
        return [m["id"] for m in self.call(who, "get", "/firm/matters").json()]


class InvitationTests(FirmFixture):
    def test_joined_colleagues_share_the_firm_with_the_invited_role(self):
        members = self.call(self.admin, "get", "/firm/members").json()
        self.assertEqual({m["role"] for m in members}, {"admin", "partner", "associate", "paralegal"})
        self.assertTrue(all(m["firm_id"] == self.admin["firm"]["id"] for m in members))
        self.assertNotIn(self.other_firm["user"]["email"], [m["email"] for m in members])

    def test_only_admins_and_partners_invite_and_only_admins_invite_admins(self):
        body = {"name": "New", "email": "new@firm-a.test", "role": "associate"}
        self.assertEqual(self.call(self.associate, "post", "/firm/invites", json=body).status_code, 403)
        self.assertEqual(self.call(self.partner, "post", "/firm/invites", json={**body, "role": "admin"}).status_code, 403)
        self.assertEqual(self.call(self.partner, "post", "/firm/invites", json=body).status_code, 201)

    def test_join_codes_work_once_and_expire(self):
        invite = self.call(self.admin, "post", "/firm/invites", json={"name": "Once", "email": "once@firm-a.test", "role": "paralegal"}).json()
        self.assertEqual(self.client.post("/api/auth/join", json={"code": invite["code"], "password": PASSWORD}).status_code, 201)
        self.assertEqual(self.client.post("/api/auth/join", json={"code": invite["code"], "password": PASSWORD}).status_code, 400)
        late = self.call(self.admin, "post", "/firm/invites", json={"name": "Late", "email": "late@firm-a.test", "role": "paralegal"}).json()
        self.db.invites.rows[-1]["expires_ts"] = time.time() - 1
        self.assertEqual(self.client.post("/api/auth/join", json={"code": late["code"], "password": PASSWORD}).status_code, 400)
        self.assertNotIn(invite["code"], str(self.db.invites.rows))

    def test_cannot_invite_an_existing_email(self):
        response = self.call(self.admin, "post", "/firm/invites", json={"name": "Dup", "email": "assoc@firm-a.test", "role": "paralegal"})
        self.assertEqual(response.status_code, 409)


class MatterTests(FirmFixture):
    def test_creator_is_first_member_and_activity_is_recorded(self):
        matter = self.open_matter()
        self.assertEqual(matter["member_ids"], [self.partner["user"]["id"]])
        entry = self.db.activity.rows[-1]
        self.assertEqual((entry["action"], entry["actor_id"]), ("matter.opened", self.partner["user"]["id"]))
        self.assertTrue(entry["at"])

    def test_paralegals_cannot_open_matters(self):
        response = self.call(self.paralegal, "post", "/firm/matters", json={"name": "X", "client_name": "Y"})
        self.assertEqual(response.status_code, 403)

    def test_other_firms_never_see_or_edit_the_matter(self):
        matter = self.open_matter()
        self.assertNotIn(matter["id"], self.ids(self.other_firm))
        self.assertEqual(self.call(self.other_firm, "get", f"/firm/matters/{matter['id']}").status_code, 404)
        self.assertEqual(self.call(self.other_firm, "patch", f"/firm/matters/{matter['id']}", json={"status": "closed"}).status_code, 404)
        self.assertEqual(self.call(self.other_firm, "get", f"/firm/matters/{matter['id']}/tasks").status_code, 404)

    def test_non_members_get_not_found_and_admins_see_all(self):
        matter = self.open_matter()
        self.assertEqual(self.call(self.associate, "get", f"/firm/matters/{matter['id']}").status_code, 404)
        self.assertNotIn(matter["id"], self.ids(self.associate))
        self.assertIn(matter["id"], self.ids(self.admin))

    def test_added_member_can_open_and_update(self):
        matter = self.open_matter()
        added = self.call(self.partner, "post", f"/firm/matters/{matter['id']}/members", json={"user_id": self.associate["user"]["id"]})
        self.assertEqual(added.status_code, 200)
        self.assertIn(matter["id"], self.ids(self.associate))
        updated = self.call(self.associate, "patch", f"/firm/matters/{matter['id']}", json={"status": "on hold"})
        self.assertEqual(updated.json()["status"], "on hold")

    def test_cannot_add_members_from_another_firm(self):
        matter = self.open_matter()
        response = self.call(self.partner, "post", f"/firm/matters/{matter['id']}/members", json={"user_id": self.other_firm["user"]["id"]})
        self.assertEqual(response.status_code, 404)


class EthicalWallTests(FirmFixture):
    def setUp(self):
        super().setUp()
        self.matter = self.open_matter()
        mid = self.matter["id"]
        for who in (self.associate, self.paralegal):
            self.call(self.partner, "post", f"/firm/matters/{mid}/members", json={"user_id": who["user"]["id"]})
        self.task = self.call(self.partner, "post", f"/firm/matters/{mid}/tasks", json={"title": "Review lease", "assignee_id": self.paralegal["user"]["id"]}).json()
        wall = self.call(self.partner, "post", f"/firm/matters/{mid}/walls", json={"user_id": self.paralegal["user"]["id"], "reason": "Prior work for the landlord"})
        self.assertEqual(wall.status_code, 200, wall.text)

    def test_walled_user_is_shut_out_of_every_path(self):
        mid = self.matter["id"]
        self.assertNotIn(mid, self.ids(self.paralegal))
        self.assertEqual(self.call(self.paralegal, "get", f"/firm/matters/{mid}").status_code, 404)
        self.assertEqual(self.call(self.paralegal, "get", f"/firm/matters/{mid}/tasks").status_code, 404)
        self.assertEqual(self.call(self.paralegal, "post", f"/firm/matters/{mid}/tasks", json={"title": "Sneak"}).status_code, 404)
        self.assertEqual(self.call(self.paralegal, "patch", f"/firm/tasks/{self.task['id']}", json={"status": "done"}).status_code, 404)
        self.assertEqual(self.call(self.paralegal, "patch", f"/firm/matters/{mid}", json={"status": "closed"}).status_code, 404)

    def test_wall_beats_admin_access_and_membership(self):
        mid = self.matter["id"]
        self.call(self.partner, "post", f"/firm/matters/{mid}/walls", json={"user_id": self.admin["user"]["id"], "reason": "Conflict"})
        self.assertNotIn(mid, self.ids(self.admin))
        readd = self.call(self.partner, "post", f"/firm/matters/{mid}/members", json={"user_id": self.paralegal["user"]["id"]})
        self.assertEqual(readd.status_code, 409)

    def test_walling_unassigns_tasks_and_is_recorded(self):
        task = self.call(self.partner, "get", f"/firm/matters/{self.matter['id']}/tasks").json()[0]
        self.assertIsNone(task["assignee_id"])
        entry = [a for a in self.db.activity.rows if a["action"] == "wall.added"][-1]
        self.assertEqual(entry["actor_id"], self.partner["user"]["id"])
        self.assertIn("Prior work for the landlord", entry["detail"])

    def test_only_partners_and_admins_manage_walls_and_see_wall_lists(self):
        mid = self.matter["id"]
        response = self.call(self.associate, "post", f"/firm/matters/{mid}/walls", json={"user_id": self.partner["user"]["id"], "reason": "x"})
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("walled_ids", self.call(self.associate, "get", f"/firm/matters/{mid}").json())
        self.assertIn(self.paralegal["user"]["id"], self.call(self.partner, "get", f"/firm/matters/{mid}").json()["walled_ids"])

    def test_removing_the_wall_is_recorded_and_allows_readding(self):
        mid = self.matter["id"]
        removed = self.call(self.partner, "delete", f"/firm/matters/{mid}/walls/{self.paralegal['user']['id']}")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self.db.activity.rows[-1]["action"], "wall.removed")
        self.call(self.partner, "post", f"/firm/matters/{mid}/members", json={"user_id": self.paralegal["user"]["id"]})
        self.assertIn(mid, self.ids(self.paralegal))


class TaskTests(FirmFixture):
    def setUp(self):
        super().setUp()
        self.matter = self.open_matter()
        self.call(self.partner, "post", f"/firm/matters/{self.matter['id']}/members", json={"user_id": self.associate["user"]["id"]})

    def test_create_assign_and_complete_records_who(self):
        mid = self.matter["id"]
        task = self.call(self.partner, "post", f"/firm/matters/{mid}/tasks", json={"title": "Draft notice", "assignee_id": self.associate["user"]["id"], "due": "2026-11-01"})
        self.assertEqual(task.status_code, 201, task.text)
        done = self.call(self.associate, "patch", f"/firm/tasks/{task.json()['id']}", json={"status": "done"})
        self.assertEqual(done.json()["status"], "done")
        self.assertEqual(done.json()["updated_by"], self.associate["user"]["id"])
        self.assertEqual(self.db.activity.rows[-1]["action"], "task.status")
        listed = self.call(self.partner, "get", f"/firm/matters/{mid}/tasks").json()
        self.assertEqual((listed[0]["status"], listed[0]["due"]), ("done", "2026-11-01"))

    def test_assignee_must_be_a_matter_member(self):
        mid = self.matter["id"]
        outsider = self.call(self.partner, "post", f"/firm/matters/{mid}/tasks", json={"title": "X", "assignee_id": self.paralegal["user"]["id"]})
        self.assertEqual(outsider.status_code, 422)
        task = self.call(self.partner, "post", f"/firm/matters/{mid}/tasks", json={"title": "Y"}).json()
        reassigned = self.call(self.partner, "patch", f"/firm/tasks/{task['id']}", json={"assignee_id": self.other_firm["user"]["id"]})
        self.assertEqual(reassigned.status_code, 422)

    def test_non_members_cannot_see_or_change_tasks(self):
        task = self.call(self.partner, "post", f"/firm/matters/{self.matter['id']}/tasks", json={"title": "Private"}).json()
        self.assertEqual(self.call(self.paralegal, "patch", f"/firm/tasks/{task['id']}", json={"status": "done"}).status_code, 404)
        self.assertEqual(self.call(self.other_firm, "patch", f"/firm/tasks/{task['id']}", json={"status": "done"}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
