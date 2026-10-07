import { useCallback, useEffect, useState } from "react";
import { Panel, Button, Badge, StatusMessage } from "./Glass";
import { api, useSession } from "@/lib/session";

const BASE = process.env.REACT_APP_BACKEND_URL;
const when = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// Downloads go through fetch so the session token travels in a header, not a URL.
export async function downloadFile(path, name) {
  const token = window.localStorage.getItem("lawsuite.session");
  const response = await fetch(`${BASE}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("The file could not be downloaded.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ClientPortal() {
  const session = useSession();
  const [matters, setMatters] = useState([]);
  const [selected, setSelected] = useState(null);
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState("");

  const run = useCallback(async (action, success = "") => {
    setMessage("");
    try {
      await action();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  useEffect(() => {
    run(async () => {
      const list = await api("/portal/matters");
      setMatters(list);
      setSelected((current) => current || list[0]?.id || null);
    });
  }, [run]);

  const load = useCallback(async () => {
    if (selected) setRoom(await api(`/portal/matters/${selected}`));
  }, [selected]);
  useEffect(() => {
    run(load);
    const timer = setInterval(() => load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [run, load]);

  return (
    <div className="v-pages v-portal">
      <div className="v-route-heading">
        <h1>Client portal</h1>
        <p className="v-demo-note">
          Welcome, {session.user?.name}. You see only what your legal team has
          shared with you.
        </p>
      </div>
      <StatusMessage>{message}</StatusMessage>
      {!matters.length && (
        <Panel title="No matters yet">
          <p>Your legal team has not shared a matter with you yet.</p>
        </Panel>
      )}
      {matters.length > 1 && (
        <Panel title="Your matters">
          <ul className="v-firm-list" aria-label="Your matters">
            {matters.map((m) => (
              <li key={m.id}>
                <button aria-pressed={m.id === selected} onClick={() => setSelected(m.id)}>
                  <b>{m.name}</b>
                  <small>{m.status}</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {room && (
        <div className="v-grid two">
          <Panel
            title={room.matter.name}
            subtitle={`Status: ${room.matter.status}${room.responsible ? ` · Lead lawyer: ${room.responsible}` : ""}`}
          >
            <h3>Updates from your legal team</h3>
            <ol className="v-firm-thread" aria-label="Shared updates">
              {room.updates.map((u) => (
                <li key={u.id}>
                  <small>{when(u.shared_at)}</small>
                  <p>
                    <b>{u.title}</b>
                  </p>
                  <p>{u.body}</p>
                </li>
              ))}
              {!room.updates.length && <li>No updates shared yet.</li>}
            </ol>
            <h3>Documents requested from you</h3>
            <ul className="v-firm-tasks" aria-label="Document requests">
              {room.requests.map((r) => (
                <li key={r.id}>
                  <span>
                    <b>{r.title}</b>
                    <small>{r.details}</small>
                    {r.documents.map((d) => (
                      <small key={d.id}>
                        Uploaded {d.file_name} · {when(d.uploaded_at)}
                      </small>
                    ))}
                  </span>
                  <Badge tone={r.status === "fulfilled" ? "green" : "blue"}>{r.status}</Badge>
                  <label className="v-field">
                    <span>Upload for {r.title}</span>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (!file) return;
                        run(async () => {
                          const body = new FormData();
                          body.append("file", file);
                          const token = window.localStorage.getItem("lawsuite.session");
                          const response = await fetch(`${BASE}/api/portal/document-requests/${r.id}/upload`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${token}` },
                            body,
                          });
                          if (!response.ok)
                            throw new Error((await response.json().catch(() => ({}))).detail || "Upload failed.");
                          await load();
                        }, `${file.name} uploaded. Your legal team has been notified.`);
                      }}
                    />
                  </label>
                </li>
              ))}
              {!room.requests.length && <li>Nothing requested.</li>}
            </ul>
          </Panel>
          <Panel title="Messages" subtitle="A secure conversation with your legal team.">
            <ol className="v-firm-thread" aria-label="Client messages">
              {room.messages.map((m) => (
                <li key={m.id}>
                  <small>
                    <b>{m.author_name}</b>
                    {m.author_kind === "firm" ? " (legal team)" : ""} · {when(m.created_at)}
                  </small>
                  <p>{m.body}</p>
                </li>
              ))}
              {!room.messages.length && <li>No messages yet.</li>}
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(`/portal/matters/${room.matter.id}/messages`, {
                    method: "POST",
                    body: { body: draft },
                  });
                  setDraft("");
                  await load();
                }, "Message sent.");
              }}
            >
              <label className="v-field">
                <span>Message to your legal team</span>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000} required />
              </label>
              <Button>Send message</Button>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
