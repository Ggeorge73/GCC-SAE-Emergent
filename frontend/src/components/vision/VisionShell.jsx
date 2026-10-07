import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FileText,
  Grid2X2,
  Home,
  LockKeyhole,
  Menu,
  Scale,
  Search,
  Settings,
  Star,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { visionGroups, visionRoute } from "./routes";
import { Button, Switch, useLocal, StatusMessage } from "./Glass";
import { navigateTo } from "@/lib/workspaceNavigation";
import { useSession } from "@/lib/session";
const Context = createContext(null);
const icons = {
  home: Home,
  briefcase: Briefcase,
  users: Users,
  grid: Grid2X2,
  file: FileText,
  lock: LockKeyhole,
};
export function VisionFrame({ children }) {
  const [preferences, setPreferences, storageError] = useLocal("appearance", {
    accent: "#0075ff",
    opaque: true,
    fixed: false,
    mini: false,
  });
  const [mobile, setMobile] = useState(false);
  const [config, setConfig] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    if (config) dialog.current?.showModal();
  }, [config]);
  useEffect(() => {
    const close = () => setMobile(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  const update = (key, value) =>
    setPreferences((p) => ({ ...p, [key]: value }));
  useEffect(() => {
    if (!mobile) return;
    const sidebar = document.querySelector(".v-sidebar");
    sidebar?.querySelector("button")?.focus();
    const trap = (event) => {
      if (event.key === "Escape") {
        setMobile(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...sidebar.querySelectorAll("button,a,input")].filter(
        (el) => el.getClientRects().length && !el.disabled,
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.querySelector(".v-menu-toggle")?.focus();
    };
  }, [mobile]);
  return (
    <Context.Provider
      value={{ preferences, update, mobile, setMobile, setConfig }}
    >
      <div
        className={`portfolio-app vision-app h-screen w-full flex ${preferences.mini ? "v-mini" : ""} ${preferences.opaque ? "v-opaque" : ""} ${preferences.fixed ? "v-fixed-header" : ""}`}
        style={{
          "--v-accent":
            {
              "#0075ff": "#0063d6",
              "#01b574": "#00784c",
              "#2cd9ff": "#08748e",
              "#e31a1a": "#bc1818",
              "#7551ff": "#7551ff",
              "#f5a623": "#915000",
            }[preferences.accent] || "#6041ba",
        }}
      >
        {children}
        <button
          className="v-floating-settings"
          aria-label="Open appearance settings"
          onClick={() => setConfig(true)}
        >
          <Settings size={23} />
        </button>
        {config && (
          <dialog
            ref={dialog}
            className="v-configurator"
            aria-labelledby="config-title"
            onCancel={() => setConfig(false)}
          >
            <header>
              <div>
                <h2 id="config-title">Law Suite Configurator</h2>
                <p>Shape your workspace.</p>
              </div>
              <button
                aria-label="Close appearance settings"
                onClick={() => setConfig(false)}
              >
                <X size={19} />
              </button>
            </header>
            <section>
              <h3>Sidenav colors</h3>
              <div className="v-swatches">
                {[
                  ["Violet", "#7551ff"],
                  ["Blue", "#0075ff"],
                  ["Green", "#01b574"],
                  ["Amber", "#f5a623"],
                  ["Red", "#e31a1a"],
                ].map(([name, color]) => (
                  <button
                    key={name}
                    style={{ background: color }}
                    aria-label={`${name} navigation accent`}
                    aria-pressed={preferences.accent === color}
                    onClick={() => update("accent", color)}
                  />
                ))}
              </div>
            </section>
            <section>
              <h3>Sidenav type</h3>
              <p>Choose your navigation surface.</p>
              <div className="v-inline">
                <Button
                  secondary={preferences.opaque}
                  onClick={() => update("opaque", false)}
                >
                  Transparent
                </Button>
                <Button
                  secondary={!preferences.opaque}
                  onClick={() => update("opaque", true)}
                >
                  Opaque
                </Button>
              </div>
            </section>
            <section>
              <Switch
                label="Navbar fixed"
                checked={preferences.fixed}
                onChange={(v) => update("fixed", v)}
              />
            </section>
            <section>
              <Switch
                label="Sidenav mini"
                checked={preferences.mini}
                onChange={(v) => update("mini", v)}
              />
            </section>
            <Button
              secondary
              onClick={() =>
                setPreferences({
                  accent: "#0075ff",
                  opaque: true,
                  fixed: false,
                  mini: false,
                })
              }
            >
              Reset appearance
            </Button>
            <StatusMessage>{storageError}</StatusMessage>
            <p className="v-config-note">
              Appearance is saved in this browser. Your matter decisions are
              managed separately.
            </p>
          </dialog>
        )}
      </div>
    </Context.Provider>
  );
}
export function VisionNavigation({ route }) {
  const { mobile, setMobile, preferences } = useContext(Context);
  const [expanded, setExpanded] = useState({});
  const go = (path) => {
    setMobile(false);
    navigateTo(path);
  };
  const path =
    window.location.hash.slice(1).split("?")[0] || "/dashboards/default";
  return (
    <>
      {mobile && (
        <button
          className="v-nav-scrim"
          aria-label="Close navigation overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`v-sidebar ${mobile ? "open" : ""}`}
        aria-label="Law Suite navigation"
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
      >
        <button
          className="v-mobile-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <button
          className="v-brand"
          onClick={() => go("/dashboards/default")}
          aria-label="Law Suite dashboard"
        >
          <Scale size={24} />
          <span>LAW SUITE</span>
        </button>
        <nav aria-label="Law Suite sections">
          {visionGroups.map((group, index) => {
            const Icon = icons[group.icon];
            const selected =
              group.pages.some(([p]) => p === path) ||
              (index === 0 && route.page === "dashboard") ||
              (index === 1 && route.page === "detail");
            return (
              <div key={group.label}>
                {index === 1 && <p className="v-nav-caption">WORKSPACE</p>}
                <button
                  className={`v-nav-group ${selected ? "selected" : ""}`}
                  aria-expanded={!!expanded[group.label]}
                  title={group.label}
                  onClick={() =>
                    setExpanded({
                      ...expanded,
                      [group.label]: !expanded[group.label],
                    })
                  }
                >
                  <span className="v-nav-icon">
                    <Icon size={15} />
                  </span>
                  <b>{group.label}</b>
                  <ChevronDown size={14} />
                </button>
                {expanded[group.label] && (
                  <div className="v-nav-children">
                    {group.pages.map(([target, label]) => (
                      <button
                        key={target}
                        aria-current={target === path ? "page" : undefined}
                        onClick={() => go(target)}
                        title={label}
                      >
                        <i />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="v-help-card">
          <span>
            <Star size={18} fill="currentColor" />
          </span>
          <h3>Need guidance?</h3>
          <p>Explore your legal workspace.</p>
          <button onClick={() => go("/applications/wizard")}>
            MATTER INTAKE
          </button>
        </div>
        {preferences.mini && (
          <span className="sr-only">Compact navigation</span>
        )}
      </aside>
    </>
  );
}
export function VisionHeader({ route, activeTab, setActiveTab }) {
  const { mobile, setMobile, preferences, update, setConfig } =
    useContext(Context);
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState(false);
  const session = useSession();
  const current = visionRoute(window.location.hash.slice(1).split("?")[0]);
  const title =
    current?.title ||
    (route.page === "dashboard"
      ? "Firm overview"
      : route.page === "detail"
        ? "Matter review"
        : route.page === "matters"
          ? "Matter Review"
          : route.page === "research"
            ? "Research & Documents"
            : "Firm Operations");
  useEffect(() => setNotifications(false), [route]);
  return (
    <header className="v-header">
      <div>
        <div className="v-breadcrumb">
          <Home size={12} />
          <span>/</span>
          <span>
            {current?.group ||
              (route.page === "dashboard" ? "Dashboards" : "Legal workspace")}
          </span>
          <span>/</span>
          <b>{title}</b>
        </div>
        <strong>{title}</strong>
      </div>
      <button
        className="v-menu-toggle"
        aria-label={mobile ? "Close navigation" : "Open navigation"}
        onClick={() =>
          window.innerWidth < 1100
            ? setMobile(!mobile)
            : update("mini", !preferences.mini)
        }
      >
        <Menu size={21} />
      </button>
      <div className="v-header-tools">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo("/matters?query=" + encodeURIComponent(query));
          }}
        >
          <Search size={15} />
          <input
            aria-label="Search the matter portfolio"
            placeholder="Type here…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        {session.status === "signed-in" && (
          <div className="v-session" aria-label="Signed-in account">
            <span>
              <b>{session.user.name}</b>
              <small>
                {session.firm.name} · {session.user.role}
              </small>
            </span>
            <button
              onClick={async () => {
                await session.signOut();
                navigateTo("/authentication/sign-in/basic");
              }}
            >
              Sign out
            </button>
          </div>
        )}
        <button
          className="v-account-link"
          aria-label="My profile"
          onClick={() => navigateTo("/pages/profile/profile-overview")}
        >
          <UserCircle size={17} />
          <span>My profile</span>
        </button>
        <button
          aria-label="Open appearance settings from header"
          onClick={() => setConfig(true)}
        >
          <Settings size={17} />
        </button>
        <div className="v-notification-anchor">
          <button
            aria-label="View notifications"
            aria-expanded={notifications}
            onClick={() => setNotifications(!notifications)}
          >
            <Bell size={16} />
          </button>
          {notifications && (
            <div className="v-notification-popover">
              <h3>Workspace notifications</h3>
              <p>Sample reminders for your next review.</p>
              <button onClick={() => navigateTo("/pages/alerts")}>
                Open notification center <ChevronRight size={14} />
              </button>
              <button
                onClick={() =>
                  navigateTo("/matters?status=Evidence+exceptions")
                }
              >
                Review outstanding evidence <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        {process.env.REACT_APP_BACKEND_URL &&
          route.workspace === "workspace" && (
            <button
              onClick={() =>
                setActiveTab(activeTab === "records" ? "audit" : "records")
              }
            >
              {activeTab === "records" ? "Activity" : "Documents"}
            </button>
          )}
      </div>
    </header>
  );
}
