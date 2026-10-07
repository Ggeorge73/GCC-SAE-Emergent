import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  FileCheck2,
  FileText,
  Globe2,
  LockKeyhole,
  Mail,
  Plus,
  Scale,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Panel,
  Button,
  LinkButton,
  Badge,
  Avatar,
  Avatars,
  Field,
  Switch,
  Metric,
  ProfileStrip,
  DemoNotice,
  useLocal,
  StatusMessage,
  demoPeople,
} from "./Glass";
import { TrendChart, Distribution, ExtraChart } from "./VisionCharts";
import {
  IntakeWizard,
  LegalCalendar,
  Register,
  ReviewBoard,
} from "./Workflows";
import { loadWorkspace, readiness } from "@/lib/matterWorkspace";
import { navigateTo } from "@/lib/workspaceNavigation";
import { serverMode, useSession } from "@/lib/session";
import { useServices } from "./serviceRecords";
import PracticeDesk from "./PracticeDesk";

function ProjectCards() {
  const matters = loadWorkspace().matters;
  return (
    <div className="v-grid three">
      {matters.slice(0, 12).map((m, i) => (
        <Panel key={m.id} className="v-project-card">
          <div className={`v-project-art art-${i % 3}`}>
            <Scale size={45} />
            <span>{m.practice}</span>
          </div>
          <div className="v-inline between">
            <span className="v-icon">
              <Briefcase size={22} />
            </span>
            <Avatars />
          </div>
          <small>{m.id}</small>
          <h2>{m.name}</h2>
          <p>{m.summary}</p>
          <div className="v-inline between">
            <small>{m.issues.length} findings</small>
            <small>{readiness(m).gaps.length} evidence exceptions</small>
          </div>
          <LinkButton to={`/matters/${m.id}/issues`} secondary>
            Open matter
          </LinkButton>
        </Panel>
      ))}
      <button
        className="v-panel v-add-tile"
        onClick={() => navigateTo("/applications/wizard")}
      >
        <Plus size={35} />
        <b>New matter intake</b>
        <span>Start with context and scope</span>
      </button>
    </div>
  );
}
function Profile() {
  const [settings, setSettings, error] = useLocal("profile-settings", {
    assignments: true,
    reminders: true,
    digest: false,
  });
  return (
    <>
      <ProfileStrip />
      <div className="v-grid profile">
        <Panel className="v-welcome-art">
          <small>Welcome back,</small>
          <h1>Maya Chen</h1>
          <p>Your judgment makes the difference.</p>
          <LinkButton to="/matters" secondary>
            Open your matters
          </LinkButton>
        </Panel>
        <Panel title="Review readiness" subtitle="Current local portfolio">
          <div className="v-radial">
            <span>
              <ShieldCheck size={35} />
              <b>
                {
                  loadWorkspace().matters.filter((m) => readiness(m).ready)
                    .length
                }
              </b>
              <small>matters ready</small>
            </span>
          </div>
          <div className="v-grid two">
            <div>
              <small>Portfolio</small>
              <h3>{loadWorkspace().matters.length} matters</h3>
            </div>
            <div>
              <small>Practice</small>
              <h3>Corporate</h3>
            </div>
          </div>
        </Panel>
        <Panel title="Profile information">
          <p>
            Leading complex transactional work with a focus on evidence,
            accountable review, and clear client delivery.
          </p>
          <dl className="v-info-list">
            <div>
              <dt>Name</dt>
              <dd>Maya Chen</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>Partner</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>maya@example.test</dd>
            </div>
            <div>
              <dt>Office</dt>
              <dd>New York</dd>
            </div>
            <div>
              <dt>Practice</dt>
              <dd>Corporate</dd>
            </div>
          </dl>
          <LinkButton to="/pages/account/settings" secondary>
            Edit profile
          </LinkButton>
        </Panel>
      </div>
      <div className="v-grid sidebar-content">
        <Panel title="Notification preferences">
          {Object.entries(settings).map(([key, value]) => (
            <Switch
              key={key}
              label={
                {
                  assignments: "Matter assignments",
                  reminders: "Review reminders",
                  digest: "Weekly summary",
                }[key]
              }
              checked={value}
              onChange={(v) => setSettings({ ...settings, [key]: v })}
            />
          ))}
          <StatusMessage>{error}</StatusMessage>
          <p>Local preview preferences.</p>
        </Panel>
        <div>
          <h2 className="v-section-title">Your portfolios</h2>
          <ProjectCards />
        </div>
      </div>
    </>
  );
}
function Teams() {
  const [comments, setComments, error] = useLocal("team-comments", [
    {
      name: "Daniel Foster",
      text: "The revised schedule is ready for a fresh source comparison.",
    },
  ]);
  const [text, setText] = useState("");
  return (
    <>
      <ProfileStrip active="teams" />
      <Panel className="v-team-strip">
        {demoPeople.map((p) => (
          <div key={p[0]}>
            <Avatar large name={p[0]} />
            <b>{p[0].split(" ")[0]}</b>
            <small>{p[1]}</small>
          </div>
        ))}
      </Panel>
      <div className="v-grid content-sidebar">
        <Panel>
          <div className="v-inline">
            <Avatar />
            <div>
              <h2>Corporate practice</h2>
              <p>Working together on Project Northstar</p>
            </div>
            <Badge>Team update</Badge>
          </div>
          <p>
            The latest review packet is ready. Inspect changed sources before
            recording fresh decisions.
          </p>
          <div className="v-social-art">
            <Scale size={85} />
            <span>
              Evidence.
              <br />
              Judgment.
              <br />
              Forward.
            </span>
          </div>
          <LinkButton to="/matters/LS-2401/drafts" secondary>
            Review the working draft
          </LinkButton>
          <h3 className="v-section-title">Team discussion</h3>
          {comments.map((c, i) => (
            <div className="v-comment" key={i}>
              <Avatar name={c.name} />
              <div>
                <b>{c.name}</b>
                <p>{c.text}</p>
              </div>
            </div>
          ))}
          <form
            className="v-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) {
                setComments([
                  ...comments,
                  { name: "Maya Chen", text: text.trim() },
                ]);
                setText("");
              }
            }}
          >
            <input
              aria-label="Local team comment"
              placeholder="Add a local demo comment…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
            />
            <Button disabled={!text.trim()}>Add</Button>
          </form>
          <StatusMessage>{error}</StatusMessage>
          <small>Comments stay in this browser; no messages are sent.</small>
        </Panel>
        <div className="v-stack">
          <Panel title="Practice teams">
            {["Corporate", "Litigation", "Regulatory"].map((name, i) => (
              <div className="v-event" key={name}>
                <span className="v-icon">
                  <Users size={18} />
                </span>
                <div>
                  <h3>{name}</h3>
                  <small>{[3, 2, 2][i]} sample participants</small>
                  <Avatars />
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Next coordination meeting">
            <CalendarDays size={30} />
            <h3>Northstar review</h3>
            <p>September 10 · 9:00 AM</p>
            <LinkButton to="/applications/calendar">Open calendar</LinkButton>
          </Panel>
        </div>
      </div>
    </>
  );
}
function Reports() {
  const [query, setQuery] = useState("");
  return (
    <>
      <div className="v-grid four">
        {[
          [Users, "Sample reviewers", "23"],
          [FileCheck2, "Completed reviews", "128"],
          [Activity, "Weekly activity", "84%"],
          [Briefcase, "Practice groups", "5"],
        ].map(([Icon, label, value]) => (
          <Metric
            key={label}
            Icon={Icon}
            label={label}
            value={value}
            detail="Illustrative"
          />
        ))}
      </div>
      <Panel
        title="Review distribution"
        subtitle="Sample team activity, separate from matter approval"
      >
        <div className="v-grid three">
          {[
            ["Completed", 68],
            ["In progress", 24],
            ["Needs attention", 8],
          ].map(([name, n]) => (
            <div key={name}>
              <div className="v-inline between">
                <b>{name}</b>
                <span>{n}%</span>
              </div>
              <progress value={n} max="100" aria-label={name} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Team report"
        action={
          <input
            aria-label="Search team report"
            placeholder="Find a colleague…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      >
        <div className="v-table-scroll">
          <table className="v-table">
            <thead>
              <tr>
                <th>Colleague</th>
                <th>Practice</th>
                <th>Role</th>
                <th>Sample reviews</th>
                <th>Activity</th>
              </tr>
            </thead>
            <tbody>
              {demoPeople
                .filter((p) =>
                  p.join(" ").toLowerCase().includes(query.toLowerCase()),
                )
                .map((p) => (
                  <tr key={p[0]}>
                    <td>
                      <span className="v-inline">
                        <Avatar name={p[0]} />
                        {p[0]}
                      </span>
                    </td>
                    <td>{p[2]}</td>
                    <td>{p[1]}</td>
                    <td>{{ MC: 28, DF: 24, PR: 36, AM: 18, JL: 22 }[p[3]]}</td>
                    <td>
                      <Badge tone="green">Active</Badge>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
function AccountSettings() {
  const [data, setData, error] = useLocal("account", {
    name: "Maya Chen",
    email: "maya@example.test",
    office: "New York",
    practice: "Corporate",
    digest: true,
    assignments: true,
  });
  const [message, setMessage] = useState("");
  const sections = [
    "Profile",
    "Basic information",
    "Security",
    "Integrations",
    "Notifications",
    "Sessions",
  ];
  return (
    <div className="v-grid sidebar-content">
      <Panel className="v-settings-nav">
        {sections.map((s) => (
          <a
            key={s}
            href={"#settings-" + s.toLowerCase().replaceAll(" ", "-")}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(
                  "settings-" + s.toLowerCase().replaceAll(" ", "-"),
                )
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {s}
            <ChevronRight size={14} />
          </a>
        ))}
      </Panel>
      <div className="v-stack">
        <Panel id="settings-profile">
          <div className="v-inline">
            <Avatar large name={data.name} />
            <div>
              <h2>{data.name}</h2>
              <p>{data.email}</p>
            </div>
            <Badge>Demo profile</Badge>
          </div>
        </Panel>
        <Panel id="settings-basic-information" title="Basic information">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMessage("Profile preferences saved locally.");
            }}
          >
            <div className="v-form-grid">
              {[
                ["name", "Full name"],
                ["email", "Email"],
                ["office", "Office"],
                ["practice", "Practice"],
              ].map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type={key === "email" ? "email" : "text"}
                  value={data[key]}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                  required
                />
              ))}
            </div>
            <Button>Save local profile</Button>
          </form>
        </Panel>
        <Panel id="settings-security" title="Account security">
          <div className="v-inline between">
            <div>
              <h3>Two-factor authentication</h3>
              <p>Identity provider connection required for live enforcement.</p>
            </div>
            <Badge tone="amber">Not connected</Badge>
          </div>
          <LinkButton to="/authentication/sign-in/basic" secondary>
            Preview sign-in
          </LinkButton>
        </Panel>
        <Panel id="settings-integrations" title="Integrations">
          {[
            "Document management",
            "Legal research provider",
            "Calendar provider",
          ].map((s) => (
            <div className="v-event" key={s}>
              <span className="v-icon">
                <Globe2 size={18} />
              </span>
              <div>
                <b>{s}</b>
                <p>Connection is not configured</p>
              </div>
              <Badge>Demo</Badge>
            </div>
          ))}
        </Panel>
        <Panel id="settings-notifications" title="Notifications">
          <Switch
            label="Assignment reminders"
            checked={data.assignments}
            onChange={(v) => setData({ ...data, assignments: v })}
          />
          <Switch
            label="Weekly activity digest"
            checked={data.digest}
            onChange={(v) => setData({ ...data, digest: v })}
          />
          <p>Preferences are local. No external notifications are sent.</p>
        </Panel>
        <Panel id="settings-sessions" title="Sessions">
          <div className="v-inline between">
            <div>
              <h3>Current browser</h3>
              <p>Local demonstration workspace</p>
            </div>
            <Badge tone="green">This session</Badge>
          </div>
        </Panel>
        <StatusMessage>{error || message}</StatusMessage>
      </div>
    </div>
  );
}
function Invoice() {
  return (
    <Panel
      className="v-invoice"
      title="LAW SUITE"
      subtitle="Sample statement · LS-2026-009"
    >
      <div className="v-inline between">
        <div>
          <h2>Corporate practice</h2>
          <p>
            100 Example Avenue
            <br />
            New York, NY · Fictional address
          </p>
        </div>
        <div>
          <h2>Aster Manufacturing</h2>
          <p>
            Project Northstar
            <br />
            Fictional engagement
          </p>
        </div>
      </div>
      <div className="v-inline between">
        <p>Issued September 8, 2026</p>
        <p>Sample due date October 8, 2026</p>
      </div>
      <div className="v-table-scroll">
        <table className="v-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Evidence and consent review</td>
              <td>8</td>
              <td>$350</td>
              <td>$2,800</td>
            </tr>
            <tr>
              <td>Research and memorandum</td>
              <td>4</td>
              <td>$350</td>
              <td>$1,400</td>
            </tr>
            <tr>
              <td>Partner review</td>
              <td>1.5</td>
              <td>$400</td>
              <td>$600</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="v-invoice-total">
        <p>
          Subtotal <b>$4,800</b>
        </p>
        <p>
          Tax <b>$0</b>
        </p>
        <h2>
          Total <b>$4,800</b>
        </h2>
      </div>
      <div className="v-inline between">
        <p>Illustrative statement only. No payment is requested.</p>
        <Button onClick={() => window.print()}>
          <Download size={15} />
          Print statement
        </Button>
      </div>
    </Panel>
  );
}
function Billing() {
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="v-grid billing">
        <Panel className="v-payment-card">
          <Wallet size={30} />
          <h2>Firm account</h2>
          <strong>•••• •••• •••• 4242</strong>
          <div className="v-inline between">
            <div>
              <small>ACCOUNT HOLDER</small>
              <h3>Law Suite demo firm</h3>
            </div>
            <Badge>Sample method</Badge>
          </div>
        </Panel>
        <Metric
          label="Illustrative monthly services"
          value="$4,800"
          Icon={Briefcase}
          detail="Sample statement"
        />
        <Panel
          title="Statements"
          action={
            <LinkButton secondary to="/pages/account/invoice">
              View statement
            </LinkButton>
          }
        >
          {["September 2026", "August 2026", "July 2026"].map((m, i) => (
            <div className="v-inline between v-list-row" key={m}>
              <div>
                <b>{m}</b>
                <small>LS-2026-00{9 - i}</small>
              </div>
              <button
                onClick={() => {
                  if (i === 0) navigateTo("/pages/account/invoice");
                  else
                    setMessage(
                      `${m} is an illustrative history entry; the September statement is available.`,
                    );
                }}
              >
                <FileText size={17} />
              </button>
            </div>
          ))}
        </Panel>
      </div>
      <div className="v-grid two">
        <Panel title="Billing information">
          <h3>Aster Manufacturing</h3>
          <p>Corporate practice · Project Northstar</p>
          <dl className="v-info-list">
            <div>
              <dt>Billing contact</dt>
              <dd>accounts@example.test</dd>
            </div>
            <div>
              <dt>Engagement lead</dt>
              <dd>Maya Chen</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>LS-2401</dd>
            </div>
          </dl>
          <LinkButton secondary to="/pages/account/settings">
            Account settings
          </LinkButton>
        </Panel>
        <Panel title="Sample transactions">
          {[
            ["Evidence review", "$2,800"],
            ["Research & memorandum", "$1,400"],
            ["Partner review", "$600"],
          ].map(([label, value]) => (
            <div className="v-event" key={label}>
              <span className="v-icon">
                <ArrowRight size={16} />
              </span>
              <div>
                <b>{label}</b>
                <p>September 2026</p>
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </Panel>
      </div>
      <StatusMessage>{message}</StatusMessage>
    </>
  );
}
function Timeline() {
  const events = loadWorkspace().events;
  const sample = [
    ["Packet received", "Complete fictional source packet available", "09:00"],
    [
      "Evidence inspection",
      "Conflicting schedule flagged for attorney review",
      "10:15",
    ],
    ["Work assigned", "Research counsel to inspect current authority", "11:30"],
    [
      "Partner checkpoint",
      "Readiness depends on documented prerequisites",
      "14:00",
    ],
  ];
  return (
    <div className="v-grid two">
      {["Matter activity", "Review milestones"].map((name, j) => (
        <Panel
          key={name}
          title={name}
          subtitle={
            j
              ? "Illustrative coordination sequence"
              : "Local decisions and source changes"
          }
          className={j ? "v-blue-panel" : ""}
        >
          <ol className="v-timeline">
            {(j || !events.length
              ? sample
              : events
                  .slice(-12)
                  .map((e) => [
                    e.action,
                    e.actor,
                    new Date(e.at).toLocaleString(),
                  ])
            ).map(([title, body, at], i) => (
              <li key={i}>
                <span className="v-icon">
                  {i % 2 ? <FileText size={15} /> : <Check size={15} />}
                </span>
                <div>
                  <h3>{title}</h3>
                  <small>{at}</small>
                  <p>{body}</p>
                  <Badge tone={j ? "green" : "blue"}>
                    {j
                      ? "Sample milestone"
                      : events.length
                        ? "Local record"
                        : "Illustrative event"}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      ))}
    </div>
  );
}
function General() {
  const [checks, setChecks, error] = useLocal("project-checklist", {});
  return (
    <>
      <div className="v-grid content-sidebar">
        <Panel className="v-blue-panel">
          <small>PROJECT NORTHSTAR</small>
          <h1>Context to decision.</h1>
          <p>Keep the source, the reviewer, and the next step connected.</p>
          <LinkButton to="/matters/LS-2401/issues" secondary>
            Open engagement
          </LinkButton>
        </Panel>
        <div className="v-grid two">
          {[
            ["Sources", "2"],
            ["Findings", "3"],
            ["Exceptions", "2"],
            ["Lead", "Maya Chen"],
          ].map(([label, value]) => (
            <Metric key={label} label={label} value={value} Icon={FileText} />
          ))}
        </div>
      </div>
      <div className="v-grid three">
        <Panel title="Coordination checklist">
          {[
            "Inspect consent language",
            "Compare source versions",
            "Assign authority check",
            "Prepare review packet",
          ].map((s) => (
            <Switch
              key={s}
              label={s}
              checked={!!checks[s]}
              onChange={(v) => setChecks({ ...checks, [s]: v })}
            />
          ))}
          <p>Coordination tasks do not approve findings.</p>
          <StatusMessage>{error}</StatusMessage>
        </Panel>
        <Panel title="Keep the next step clear" className="v-welcome-art">
          <BookOpen size={33} />
          <h2>Every conclusion needs context.</h2>
          <p>Move from the working draft to its supporting evidence.</p>
          <LinkButton secondary to="/research">
            Explore sources
          </LinkButton>
        </Panel>
        <Panel title="Task trend" subtitle="Illustrative activity">
          <TrendChart kind="line" height={210} />
        </Panel>
      </div>
    </>
  );
}
function Pricing() {
  const [yearly, setYearly] = useState(false);
  const [chosen, setChosen] = useState("");
  return (
    <>
      <div className="v-pricing-hero">
        <Scale size={40} />
        <h1>A workspace for every practice.</h1>
        <p>Illustrative plan comparison for this prototype.</p>
        <div className="v-segmented">
          <button aria-pressed={!yearly} onClick={() => setYearly(false)}>
            Monthly
          </button>
          <button aria-pressed={yearly} onClick={() => setYearly(true)}>
            Yearly
          </button>
        </div>
      </div>
      <div className="v-grid three v-pricing-cards">
        {[
          [
            "Practice",
            49,
            ["Matter review", "Local source context", "Draft workspace"],
          ],
          [
            "Firm",
            89,
            ["Practice features", "Team workflows", "Firm reporting"],
          ],
          [
            "Enterprise",
            149,
            ["Firm features", "Governance planning", "Integration design"],
          ],
        ].map(([name, price, features]) => (
          <Panel key={name} title={name}>
            <h1>
              ${yearly ? Math.round(price * 0.8) : price}
              <small> / user / month</small>
            </h1>
            <p>
              {yearly
                ? "Illustrative annual commitment"
                : "Illustrative monthly rate"}
            </p>
            <ul className="v-feature-list">
              {features.map((f) => (
                <li key={f}>
                  <Check size={16} />
                  {f}
                </li>
              ))}
            </ul>
            <Button onClick={() => setChosen(name)}>Preview {name}</Button>
          </Panel>
        ))}
      </div>
      <StatusMessage>
        {chosen &&
          `${chosen} selected for comparison. No subscription or payment has been created.`}
      </StatusMessage>
      <Panel title="Questions, answered">
        {[
          [
            "Is this a live subscription?",
            "No. Prices and plan features illustrate a proposed product structure.",
          ],
          [
            "Does the demo connect legal research?",
            "The public preview uses fictional source records. Production integrations require separate implementation.",
          ],
          [
            "Where is progress saved?",
            "In the current browser. This is not a firm database.",
          ],
        ].map(([q, a]) => (
          <details className="v-faq" key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </Panel>
    </>
  );
}
function Alerts() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState([0, 1, 2, 3]);
  return (
    <Panel
      title="Notification center"
      subtitle="Sample states for the legal workspace"
    >
      {[
        [
          "blue",
          "New source version",
          "A source comparison is ready for attorney inspection.",
        ],
        [
          "green",
          "Local draft saved",
          "Your working note was retained in this browser.",
        ],
        [
          "amber",
          "Evidence requires attention",
          "An unresolved source question remains visible.",
        ],
        [
          "red",
          "Handoff blocked",
          "Review prerequisites must be completed before internal approval.",
        ],
      ].map(
        ([tone, title, body], i) =>
          visible.includes(i) && (
            <div role="status" className={`v-alert ${tone}`} key={title}>
              <Bell size={20} />
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
              <button
                aria-label={`Dismiss ${title}`}
                onClick={() => setVisible(visible.filter((n) => n !== i))}
              >
                ×
              </button>
            </div>
          ),
      )}
      <div className="v-inline wrap">
        {[
          "Review reminder",
          "Saved draft",
          "Blocked handoff",
          "Source update",
        ].map((s) => (
          <Button
            secondary
            key={s}
            onClick={() =>
              setMessage(`${s}: sample notification displayed locally.`)
            }
          >
            {s}
          </Button>
        ))}
      </div>
      <StatusMessage>{message}</StatusMessage>
      <Button secondary onClick={() => setVisible([0, 1, 2, 3])}>
        Restore sample alerts
      </Button>
    </Panel>
  );
}
function Services({ kind }) {
  const {
    data,
    update: setData,
    error,
    proposals,
    setSelected,
  } = useServices();
  const requestId = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "request",
  );
  const request = loadWorkspace().matters.find((m) => m.id === requestId);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [format, setFormat] = useState("Internal memorandum");
  if (kind === "order-list") return <Register requests />;
  if (kind === "order-details" && !request)
    return (
      <Panel
        title="Request not found"
        subtitle="Select an engagement request to open its client and matter details."
      >
        <LinkButton to="/ecommerce/orders/order-list">
          Engagement requests
        </LinkButton>
      </Panel>
    );
  if (kind === "order-details")
    return (
      <Panel
        className="v-order-detail"
        title={`Engagement request ${request.id}-R`}
        subtitle="Submitted September 8, 2026 · fictional request"
      >
        <div className="v-inline between">
          <div>
            <h2>{request.client}</h2>
            <p>
              {request.id} · {request.name}
            </p>
          </div>
          <Badge tone="amber">Scope review</Badge>
        </div>
        <div className="v-grid two">
          <Panel title="Coordination timeline">
            <ol className="v-timeline">
              {[
                "Request prepared",
                "Conflict review pending",
                "Scope confirmation pending",
                "Engagement approval pending",
              ].map((s, i) => (
                <li key={s}>
                  <span className="v-icon">
                    {i ? <CalendarDays size={14} /> : <Check size={14} />}
                  </span>
                  <div>
                    <h3>{s}</h3>
                    <small>
                      {i
                        ? "Required before work begins"
                        : "Local demonstration"}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <div>
            <h3>Engagement information</h3>
            <dl className="v-info-list">
              <div>
                <dt>Client</dt>
                <dd>{request.client}</dd>
              </div>
              <div>
                <dt>Lead</dt>
                <dd>{request.owner}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{request.summary}</dd>
              </div>
              <div>
                <dt>Illustrative estimate</dt>
                <dd>Requires agreed scope and fee review</dd>
              </div>
            </dl>
            <LinkButton to={`/matters/${request.id}/issues`}>
              Open related matter
            </LinkButton>
          </div>
        </div>
      </Panel>
    );
  if (!data)
    return (
      <Panel title="Service proposal not found">
        <LinkButton to="/ecommerce/products/new-product">
          New service
        </LinkButton>
      </Panel>
    );
  if (kind === "edit-product")
    return (
      <>
        <div className="v-inline between">
          <h1>Edit legal service</h1>
          <Badge>Local proposal</Badge>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(
              "Service proposal updated locally. No offering was published.",
            );
          }}
        >
          <div className="v-grid sidebar-content">
            <Panel className="v-service-art">
              <Scale size={70} />
              <h2>{data.name}</h2>
              <p>
                Defined scope.
                <br />
                Accountable delivery.
              </p>
              <label className="v-field">
                <span>Reference material name</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setFile(e.target.files[0]?.name || "")}
                />
              </label>
              <small>
                {file
                  ? `${file} selected locally; contents are not uploaded.`
                  : "Optional local reference; no upload service connected."}
              </small>
            </Panel>
            <Panel title="Service information">
              <div className="v-form-grid">
                {[
                  ["name", "Service name"],
                  ["practice", "Practice"],
                  ["fee", "Illustrative fee (USD)"],
                  ["lead", "Service lead"],
                ].map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    type={key === "fee" ? "number" : "text"}
                    min={key === "fee" ? 0 : undefined}
                    value={data[key]}
                    onChange={(e) =>
                      setData({ ...data, [key]: e.target.value })
                    }
                    required
                  />
                ))}
              </div>
              {[
                ["scope", "Scope and exclusions"],
                ["materials", "Required materials"],
              ].map(([key, label]) => (
                <label className="v-field" key={key}>
                  <span>{label}</span>
                  <textarea
                    value={data[key]}
                    onChange={(e) =>
                      setData({ ...data, [key]: e.target.value })
                    }
                    required
                    rows={4}
                  />
                </label>
              ))}
              <Button>Save proposal</Button>
              <StatusMessage>{error || message}</StatusMessage>
            </Panel>
          </div>
        </form>
      </>
    );
  return (
    <>
      <Panel>
        <div className="v-grid two">
          <div className="v-service-art">
            <Scale size={95} />
            <h1>
              Clarity before
              <br />
              commitment.
            </h1>
            <p>Acquisition diligence</p>
          </div>
          <div className="v-service-info">
            <label className="v-field">
              <span>Saved service proposals</span>
              <select
                value={data.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  navigateTo(
                    `/ecommerce/products/product-page?service=${encodeURIComponent(e.target.value)}`,
                  );
                }}
              >
                {proposals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.status}
                  </option>
                ))}
              </select>
            </label>
            <Badge>
              {data.practice} · {data.status}
            </Badge>
            <small>{data.id}</small>
            <h1>{data.name}</h1>
            <p>{data.scope}</p>
            <h2>
              ${Number(data.fee || 0).toLocaleString()}{" "}
              <small>illustrative estimate</small>
            </h2>
            <label className="v-field">
              <span>Delivery format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option>Internal memorandum</option>
                <option>Exception report</option>
              </select>
            </label>
            <Field
              label="Review workstreams"
              type="number"
              min="1"
              max="20"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                )
              }
            />
            <p>
              Example total: $
              {(Number(data.fee || 0) * quantity).toLocaleString()}
            </p>
            <Button
              onClick={() =>
                setMessage(
                  `${quantity} ${format.toLowerCase()} workstream(s) selected locally. A real engagement requires conflicts clearance and agreed scope.`,
                )
              }
            >
              Prepare request
            </Button>
            <LinkButton
              secondary
              to={`/ecommerce/products/edit-product?service=${encodeURIComponent(data.id)}`}
            >
              Edit service
            </LinkButton>
            <StatusMessage>{message}</StatusMessage>
          </div>
        </div>
      </Panel>
      <Panel title="Required materials">
        <p>{data.materials}</p>
        <LinkButton to="/applications/wizard" secondary>
          Start matter intake
        </LinkButton>
      </Panel>
    </>
  );
}
function Auth({ kind }) {
  const signup = kind.startsWith("sign-up");
  const variant = kind.split("-").pop();
  const [message, setMessage] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useSession();
  const submit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!serverMode) {
      form.reset();
      setMessage(
        signup
          ? "Demo request validated. No account was created or invitation sent."
          : "Demo form validated. Live authentication is not connected.",
      );
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setMessage("");
    try {
      if (signup)
        await session.signUp({
          firm_name: data.firm_name,
          name: data.name,
          email: data.email,
          password: data.password,
        });
      else await session.signIn(data.email, data.password);
      navigateTo("/dashboard");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`v-auth ${variant}`}>
      <div className="v-auth-art">
        <Scale size={85} />
        <p>INSIGHT. INTEGRITY. IMPACT.</p>
        <h1>Law Suite</h1>
        <span>Evidence before delivery.</span>
      </div>
      <Panel className="v-auth-form">
        <h1>{signup ? "Join your workspace" : "Welcome back"}</h1>
        <p>
          {serverMode
            ? signup
              ? "Create your firm's workspace. You will be its administrator."
              : "Sign in to your firm's workspace."
            : signup
              ? "Prepare a demo account request."
              : "Explore the account access experience."}
        </p>
        <form onSubmit={submit}>
          {signup && serverMode && (
            <Field
              label="Firm name"
              name="firm_name"
              required
              autoComplete="organization"
            />
          )}
          {signup && (
            <Field label="Full name" name="name" required autoComplete="name" />
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="name@example.test"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={serverMode ? "At least 8 characters" : "Use a fictional password"}
          />
          {!serverMode && (
            <Switch
              label="Remember this demo preference"
              checked={remember}
              onChange={setRemember}
            />
          )}
          <Button disabled={busy}>
            {serverMode
              ? signup
                ? "CREATE WORKSPACE"
                : "SIGN IN"
              : signup
                ? "PREVIEW ACCOUNT REQUEST"
                : "PREVIEW SIGN IN"}
          </Button>
        </form>
        <StatusMessage>{message}</StatusMessage>
        {!serverMode && (
          <p>
            Use fictional credentials. Passwords are neither saved nor
            transmitted.
          </p>
        )}
        <button
          className="v-text-link"
          onClick={() =>
            navigateTo(
              `/authentication/${signup ? "sign-in" : "sign-up"}/${variant}`,
            )
          }
        >
          {signup
            ? "Already have an account? Sign in"
            : "Need access? Join your workspace"}
        </button>
      </Panel>
    </div>
  );
}
function Widgets() {
  const [quiet, setQuiet] = useLocal("quiet-hours", false);
  return (
    <>
      <div className="v-grid four">
        {[
          ["Review queue", "18", FileCheck2],
          ["Upcoming meetings", "4", CalendarDays],
          ["Source packets", "32", FileText],
          ["Practice teams", "5", Users],
        ].map(([label, value, Icon]) => (
          <Metric
            key={label}
            label={label}
            value={value}
            Icon={Icon}
            detail="Illustrative"
          />
        ))}
      </div>
      <div className="v-grid three">
        <Panel title="Next review">
          <CalendarDays size={35} />
          <h2>Northstar checkpoint</h2>
          <p>September 10 · 9:00 AM</p>
          <LinkButton to="/applications/calendar">View calendar</LinkButton>
        </Panel>
        <Panel title="Focus preferences">
          <div className="v-radial">
            <span>
              <Bell size={40} />
            </span>
          </div>
          <Switch
            label="Quiet workspace preference"
            checked={quiet}
            onChange={setQuiet}
          />
          <p>Local appearance preference only.</p>
        </Panel>
        <Panel title="Practice balance" subtitle="Illustrative workload">
          <Distribution kind="doughnut" />
        </Panel>
        <Panel title="Research activity">
          <TrendChart kind="line" height={200} />
        </Panel>
        <Panel title="Latest source packet" className="v-welcome-art">
          <FileText size={45} />
          <h2>Context in view.</h2>
          <p>Browse linked excerpts and source versions.</p>
          <LinkButton to="/research" secondary>
            Open sources
          </LinkButton>
        </Panel>
        <Panel title="Quick actions">
          <div className="v-stack">
            <LinkButton to="/applications/wizard">New intake</LinkButton>
            <LinkButton to="/applications/kanban" secondary>
              Review board
            </LinkButton>
            <LinkButton to="/matters" secondary>
              Matter directory
            </LinkButton>
          </div>
        </Panel>
      </div>
    </>
  );
}
function CRM() {
  return (
    <>
      <div className="v-grid content-sidebar">
        <div className="v-stack">
          <div className="v-grid three">
            <Metric
              label="Client organizations"
              value="12"
              detail="Illustrative"
              Icon={Users}
            />
            <Metric
              label="Active relationships"
              value="9"
              detail="Illustrative"
              Icon={Briefcase}
            />
            <button
              className="v-panel v-add-tile"
              onClick={() => navigateTo("/applications/wizard")}
            >
              <Plus />
              <b>New engagement</b>
            </button>
          </div>
          <LegalCalendar compact />
        </div>
        <div className="v-stack">
          <Panel className="v-welcome-art">
            <small>CLIENT RELATIONSHIPS</small>
            <h1>
              Closer to
              <br />
              the context.
            </h1>
            <p>Bring the right people and the next conversation together.</p>
            <Avatars />
          </Panel>
          <Panel title="Client conversations">
            {[
              "Aster Manufacturing",
              "Meridian Systems",
              "Evergreen Health Technologies",
            ].map((c, i) => (
              <div key={c} className="v-event">
                <Avatar name={c} />
                <div>
                  <h3>{c}</h3>
                  <p>
                    {
                      [
                        "Diligence review",
                        "Evidence checkpoint",
                        "Policy workshop",
                      ][i]
                    }
                  </p>
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Next milestone">
            <Badge tone="green">Internal review</Badge>
            <h2>Northstar memorandum</h2>
            <p>September 10 · confirm prerequisites</p>
            <LinkButton to="/matters/LS-2401/handoff" secondary>
              View readiness
            </LinkButton>
          </Panel>
        </div>
      </div>
      <Billing />
    </>
  );
}
function Charts() {
  return (
    <div className="v-grid two">
      <Panel title="Practice volume" subtitle="Illustrative activity">
        <ExtraChart />
      </Panel>
      <Panel title="Practice intensity" subtitle="Illustrative activity">
        <ExtraChart polar />
      </Panel>
      {[
        ["Research trend", "line"],
        ["Review activity", "area"],
        ["Monthly volume", "bar"],
        ["Research and review", "mixed"],
      ].map(([title, kind]) => (
        <Panel key={kind} title={title} subtitle="Illustrative sample sessions">
          <TrendChart kind={kind} />
        </Panel>
      ))}
      {[
        ["Practice distribution", "pie"],
        ["Review composition", "doughnut"],
        ["Practice comparison", "radar"],
        ["Session relationship", "bubble"],
      ].map(([title, kind]) => (
        <Panel key={kind} title={title} subtitle="Illustrative practice data">
          <Distribution kind={kind} />
        </Panel>
      ))}
    </div>
  );
}
export default function VisionPages({ route }) {
  const kind = route.page;
  let content;
  if (kind === "crm") content = <CRM />;
  else if (kind === "practice-desk") content = <PracticeDesk />;
  else if (kind === "profile") content = <Profile />;
  else if (kind === "teams") content = <Teams />;
  else if (kind === "projects")
    content = (
      <>
        <ProfileStrip active="projects" />
        <ProjectCards />
      </>
    );
  else if (kind === "reports") content = <Reports />;
  else if (["new-user", "new-product", "wizard"].includes(kind))
    content = <IntakeWizard kind={kind} />;
  else if (kind === "settings") content = <AccountSettings />;
  else if (kind === "billing") content = <Billing />;
  else if (kind === "invoice") content = <Invoice />;
  else if (kind === "general") content = <General />;
  else if (kind === "timeline") content = <Timeline />;
  else if (kind === "pricing") content = <Pricing />;
  else if (kind === "widgets") content = <Widgets />;
  else if (kind === "charts") content = <Charts />;
  else if (kind === "alerts") content = <Alerts />;
  else if (kind === "kanban") content = <ReviewBoard />;
  else if (kind === "calendar") content = <LegalCalendar />;
  else if (kind === "data-tables") content = <Register />;
  else if (kind === "rtl")
    content = (
      <div dir="rtl" className="v-rtl">
        <h1>مكتب الشؤون الدولية</h1>
        <p>مساحة عمل قانونية · بيانات توضيحية</p>
        <div className="v-grid four">
          {[
            ["القضايا", "3"],
            ["المراجعات", "7"],
            ["الفرق", "3"],
            ["المصادر", "5"],
          ].map(([label, value]) => (
            <Metric key={label} label={label} value={value} Icon={Globe2} />
          ))}
        </div>
        <div className="v-grid two">
          <Panel title="نظرة عامة">
            <TrendChart />
          </Panel>
          <Panel title="توزيع العمل">
            <Distribution kind="doughnut" />
          </Panel>
        </div>
        <Timeline />
      </div>
    );
  else if (kind.startsWith("sign-")) content = <Auth kind={kind} />;
  else content = <Services kind={kind} />;
  return (
    <div className="v-pages" key={route.path} data-route={route.path}>
      {![
        "profile",
        "teams",
        "projects",
        "wizard",
        "new-user",
        "new-product",
      ].includes(kind) &&
        !kind.startsWith("sign-") && (
          <div className="v-route-heading">
            <h1>{route.title}</h1>
            <DemoNotice />
          </div>
        )}
      {content}
      {[
        "billing",
        "invoice",
        "crm",
        "general",
        "timeline",
        "order-list",
      ].includes(kind) && (
        <Panel
          title="Continue the matter workflow"
          subtitle="Open intake review, attorney time, draft invoices, client updates, research instructions, or closing records."
        >
          <LinkButton to="/applications/practice-desk">
            Open practice desk
          </LinkButton>
        </Panel>
      )}
      <footer className="v-footer">
        <span>Law Suite · Evidence before delivery.</span>
        <div>
          <button onClick={() => navigateTo("/matters")}>Matters</button>
          <button onClick={() => navigateTo("/research")}>Research</button>
          <button onClick={() => navigateTo("/pages/account/settings")}>
            Settings
          </button>
        </div>
      </footer>
    </div>
  );
}
