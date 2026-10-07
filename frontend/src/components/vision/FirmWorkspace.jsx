import { useCallback, useEffect, useState } from "react";
import { Panel, Button, LinkButton, Badge, StatusMessage } from "./Glass";
import { api, serverMode, useSession } from "@/lib/session";

// Mirrors the server's permission table for showing controls; the API still decides.
const MATTER_LEADS = ["admin", "partner", "associate"];
const WALL_KEEPERS = ["admin", "partner"];

function Select({ label, value, onChange, children, ...props }) {
  return (
    <label className="v-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} {...props}>
        {children}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, ...props }) {
  return (
    <label className="v-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={250}
        {...props}
      />
    </label>
  );
}

export default function FirmWorkspace() {
  const session = useSession();
  if (!serverMode)
    return (
      <Panel
        title="Shared firm workspace"
        subtitle="Matters, tasks and ethical walls shared by everyone in your firm."
      >
        <p>
          This public demo keeps records in your browser only. Connect Law
          Suite to its API to share matters across the firm; see the README
          section “Sign in with a live API”.
        </p>
        <LinkButton to="/matters">Open the demo matter review</LinkButton>
      </Panel>
    );
  if (session.status !== "signed-in") return null;
  if (session.user.role === "client")
    return (
      <Panel title="Client portal">
        <p>Your firm shares updates with you in the client portal.</p>
      </Panel>
    );
  return <Workspace user={session.user} />;
}

function Workspace({ user }) {
  const [members, setMembers] = useState([]);
  const [matters, setMatters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");

  const run = useCallback(async (action, success = "") => {
    setMessage("");
    try {
      const result = await action();
      if (success) setMessage(success);
      return result;
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const [people, list] = await Promise.all([
      api("/firm/members"),
      api("/firm/matters"),
    ]);
    setMembers(people);
    setMatters(list);
    const requested = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    ).get("matter");
    setSelected((current) =>
      list.some((m) => m.id === requested)
        ? requested
        : list.some((m) => m.id === current)
          ? current
          : list[0]?.id || null,
    );
  }, []);

  useEffect(() => {
    run(refresh);
    // Pick up colleagues' changes without a manual reload.
    const quietly = () => refresh().catch(() => {});
    const timer = setInterval(quietly, 15000);
    window.addEventListener("focus", quietly);
    window.addEventListener("hashchange", quietly);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", quietly);
      window.removeEventListener("hashchange", quietly);
    };
  }, [run, refresh]);

  const matter = matters.find((m) => m.id === selected);
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "Former member";

  return (
    <div className="v-firm">
      <StatusMessage>{message}</StatusMessage>
      <div className="v-grid two">
        <MatterList
          user={user}
          matters={matters}
          selected={selected}
          onSelect={setSelected}
          onCreate={(details) =>
            run(async () => {
              const created = await api("/firm/matters", {
                method: "POST",
                body: details,
              });
              await refresh();
              setSelected(created.id);
            }, "Matter opened and shared with its members.")
          }
        />
        {matter ? (
          <MatterPanel
            key={matter.id}
            user={user}
            matter={matter}
            members={members}
            nameOf={nameOf}
            run={run}
            refresh={refresh}
          />
        ) : (
          <Panel title="No matter selected">
            <p>Open a matter, or ask a colleague to add you to one.</p>
          </Panel>
        )}
      </div>
      <Directory user={user} members={members} run={run} />
    </div>
  );
}

function MatterList({ user, matters, selected, onSelect, onCreate }) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  return (
    <Panel title="Firm matters" subtitle="Only matters you belong to are listed.">
      <ul className="v-firm-list" aria-label="Firm matters">
        {matters.map((m) => (
          <li key={m.id}>
            <button
              aria-pressed={m.id === selected}
              onClick={() => onSelect(m.id)}
            >
              <b>{m.name}</b>
              <small>
                {m.client_name} · {m.status}
              </small>
            </button>
          </li>
        ))}
        {!matters.length && <li>No shared matters yet.</li>}
      </ul>
      {MATTER_LEADS.includes(user.role) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ name, client_name: client });
            setName("");
            setClient("");
          }}
        >
          <TextField label="Matter name" value={name} onChange={setName} required />
          <TextField label="Client" value={client} onChange={setClient} required />
          <Button>Open matter</Button>
        </form>
      )}
    </Panel>
  );
}

function MatterPanel({ user, matter, members, nameOf, run, refresh }) {
  const [tasks, setTasks] = useState([]);
  const [newMember, setNewMember] = useState("");
  const [wallTarget, setWallTarget] = useState("");
  const [wallReason, setWallReason] = useState("");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const base = `/firm/matters/${matter.id}`;

  const loadTasks = useCallback(
    async () => setTasks(await api(`${base}/tasks`)),
    [base],
  );
  useEffect(() => {
    run(loadTasks);
  }, [run, loadTasks, matter.updated_at]);

  const staff = members.filter((m) => m.role !== "client" && m.active !== false);
  const walled = matter.walled_ids || [];
  const candidates = staff.filter(
    (m) => !matter.member_ids.includes(m.id) && !walled.includes(m.id),
  );

  return (
    <Panel
      title={matter.name}
      subtitle={`${matter.client_name} · responsible: ${nameOf(matter.responsible_id)}`}
    >
      <Select
        label={`Status · ${matter.name}`}
        value={matter.status}
        onChange={(status) =>
          run(async () => {
            await api(base, { method: "PATCH", body: { status } });
            await refresh();
          }, "Matter status updated.")
        }
      >
        {["open", "on hold", "closed"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>

      <h3>Members</h3>
      <ul className="v-firm-people" aria-label="Matter members">
        {matter.member_ids.map((id) => (
          <li key={id}>{nameOf(id)}</li>
        ))}
      </ul>
      {MATTER_LEADS.includes(user.role) && candidates.length > 0 && (
        <form
          className="v-inline"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(`${base}/members`, {
                method: "POST",
                body: { user_id: newMember },
              });
              setNewMember("");
              await refresh();
            }, "Member added.");
          }}
        >
          <Select label="Add member" value={newMember} onChange={setNewMember} required>
            <option value="">Choose a colleague</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </Select>
          <Button>Add</Button>
        </form>
      )}

      {WALL_KEEPERS.includes(user.role) && (
        <>
          <h3>Ethical walls</h3>
          <ul className="v-firm-people" aria-label="Walled colleagues">
            {walled.map((id) => (
              <li key={id}>
                {nameOf(id)}{" "}
                <Button
                  secondary
                  onClick={() =>
                    run(async () => {
                      await api(`${base}/walls/${id}`, { method: "DELETE" });
                      await refresh();
                    }, "Wall removed.")
                  }
                >
                  Remove wall
                </Button>
              </li>
            ))}
            {!walled.length && <li>No walls on this matter.</li>}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`${base}/walls`, {
                  method: "POST",
                  body: { user_id: wallTarget, reason: wallReason },
                });
                setWallTarget("");
                setWallReason("");
                await refresh();
              }, "Wall recorded. The colleague can no longer open this matter.");
            }}
          >
            <Select label="Wall off colleague" value={wallTarget} onChange={setWallTarget} required>
              <option value="">Choose a colleague</option>
              {staff
                .filter((m) => m.id !== user.id && !walled.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
            </Select>
            <TextField label="Reason for wall" value={wallReason} onChange={setWallReason} required />
            <Button secondary>Record wall</Button>
          </form>
        </>
      )}

      <h3>Tasks</h3>
      <ul className="v-firm-tasks" aria-label="Matter tasks">
        {tasks.map((t) => (
          <li key={t.id}>
            <span>
              <b>{t.title}</b>
              <small>
                {t.assignee_id ? nameOf(t.assignee_id) : "Unassigned"}
                {t.due ? ` · due ${t.due}` : ""}
              </small>
            </span>
            <Badge tone={t.status === "done" ? "green" : "blue"}>{t.status}</Badge>
            <Select
              label={`Task status · ${t.title}`}
              value={t.status}
              onChange={(status) =>
                run(async () => {
                  await api(`/firm/tasks/${t.id}`, {
                    method: "PATCH",
                    body: { status },
                  });
                  await loadTasks();
                })
              }
            >
              {["to do", "in progress", "done"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </li>
        ))}
        {!tasks.length && <li>No tasks yet.</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api(`${base}/tasks`, {
              method: "POST",
              body: { title, assignee_id: assignee || null, due: due || null },
            });
            setTitle("");
            setAssignee("");
            setDue("");
            await loadTasks();
          }, "Task added.");
        }}
      >
        <TextField label="Task title" value={title} onChange={setTitle} required />
        <Select label="Assign to" value={assignee} onChange={setAssignee}>
          <option value="">Unassigned</option>
          {matter.member_ids.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </Select>
        <TextField label="Due date" type="date" value={due} onChange={setDue} />
        <Button>Add task</Button>
      </form>
      <Discussion matter={matter} user={user} nameOf={nameOf} run={run} />
    </Panel>
  );
}

const ACTIONS = {
  "matter.opened": "opened the matter",
  "matter.updated": "updated",
  "member.added": "added member",
  "member.removed": "removed member",
  "wall.added": "recorded an ethical wall:",
  "wall.removed": "removed the wall for",
  "task.created": "created task",
  "task.status": "changed task status:",
  "task.assigned": "assigned task",
  "comment.posted": "commented:",
};
const when = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

function Discussion({ matter, user, nameOf, run }) {
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState([]);
  const base = `/firm/matters/${matter.id}`;
  const load = useCallback(async () => {
    const [thread, feed] = await Promise.all([
      api(`${base}/comments`),
      api(`${base}/activity`),
    ]);
    setComments(thread);
    setActivity(feed);
  }, [base]);
  useEffect(() => {
    run(load);
    const timer = setInterval(() => load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [run, load, matter.updated_at]);

  const mentionable = matter.member_ids.filter(
    (id) => id !== user.id && !mentions.includes(id),
  );
  return (
    <>
      <h3>Discussion</h3>
      <p className="v-firm-note">Internal to the firm. Never shown to clients.</p>
      <ol className="v-firm-thread" aria-label="Matter discussion">
        {comments.map((c) => (
          <li key={c.id}>
            <small>
              <b>{c.author_name}</b> ({c.author_role}) · {when(c.created_at)}
            </small>
            <p>{c.body}</p>
          </li>
        ))}
        {!comments.length && <li>No comments yet.</li>}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api(`${base}/comments`, {
              method: "POST",
              body: { body, mention_ids: mentions },
            });
            setBody("");
            setMentions([]);
            await load();
          }, mentions.length ? "Comment posted. Mentioned colleagues were notified." : "Comment posted.");
        }}
      >
        <label className="v-field">
          <span>Comment</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            required
          />
        </label>
        {mentionable.length > 0 && (
          <Select
            label="Mention colleague"
            value=""
            onChange={(id) => {
              if (!id) return;
              setMentions([...mentions, id]);
              setBody((text) => `${text}${text && !text.endsWith(" ") ? " " : ""}@${nameOf(id)} `);
            }}
          >
            <option value="">Choose a matter member</option>
            {mentionable.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </Select>
        )}
        {mentions.length > 0 && (
          <p className="v-firm-note">
            Will notify: {mentions.map(nameOf).join(", ")}
          </p>
        )}
        <Button>Post comment</Button>
      </form>
      <h3>Activity</h3>
      <ol className="v-firm-thread" aria-label="Matter activity">
        {activity.map((a) => (
          <li key={a.id}>
            <small>{when(a.at)}</small>
            <p>
              <b>{a.actor_name}</b> {ACTIONS[a.action] || a.action} {a.detail}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

function Directory({ user, members, run }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("associate");
  const [code, setCode] = useState("");
  return (
    <Panel title="Firm directory" subtitle="Everyone with an account at your firm.">
      <table className="v-firm-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.email}</td>
              <td>{m.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {WALL_KEEPERS.includes(user.role) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCode("");
            run(async () => {
              const result = await api("/firm/invites", {
                method: "POST",
                body: { name, email, role },
              });
              setCode(result.code);
              setName("");
              setEmail("");
            });
          }}
        >
          <h3>Invite a colleague</h3>
          <TextField label="Colleague name" value={name} onChange={setName} required />
          <TextField label="Colleague email" type="email" value={email} onChange={setEmail} required />
          <Select label="Role" value={role} onChange={setRole}>
            {(user.role === "admin"
              ? ["admin", "partner", "associate", "paralegal"]
              : ["partner", "associate", "paralegal"]
            ).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          <Button>Create invitation</Button>
        </form>
      )}
      {code && (
        <p className="v-firm-code" role="status">
          Invitation code: <code data-testid="invite-code">{code}</code>. Share
          it privately; it works once and expires in 7 days. Your colleague
          enters it on the Join with invitation page.
        </p>
      )}
    </Panel>
  );
}
