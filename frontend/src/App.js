import { useState, useEffect } from "react";
import "@/App.css";
import FirmOperations from "@/components/FirmOperations";
import MatterDesk from "@/components/MatterDesk";
import ResearchWorkspace from "@/components/ResearchWorkspace";
import {
  VisionFrame,
  VisionNavigation as WorkspaceNavigation,
  VisionHeader,
} from "@/components/vision/VisionShell";
import VisionPages from "@/components/vision/VisionPages";
import ClientPortal from "@/components/vision/ClientPortal";
import { readRoute, navigateTo } from "@/lib/workspaceNavigation";
import { serverMode, useSession } from "@/lib/session";
import "@/components/PortfolioShell.css";
import "@/components/vision/Vision.css";
import { Toaster } from "sonner";

function App() {
  const [route, setRoute] = useState(readRoute);
  const workspaceMode = route.workspace;
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  // With a live API the workspace opens only after sign-in; the public demo stays open.
  const session = useSession();
  const onAuthPage =
    route.workspace === "vision" &&
    (route.page.startsWith("sign-") || route.page === "join");
  const locked = serverMode && session.status !== "signed-in" && !onAuthPage;
  // Clients only ever see their portal, whatever address they open.
  const isClient = session.status === "signed-in" && session.user.role === "client";
  useEffect(() => {
    if (locked && session.status === "signed-out")
      navigateTo("/authentication/sign-in/basic");
  }, [locked, session.status, route]);

  return (
    <VisionFrame>
      <Toaster position="top-right" richColors />
      {!isClient && <WorkspaceNavigation route={route} />}

      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <VisionHeader route={route} />
        {isClient ? (
          <ClientPortal />
        ) : locked ? (
          <p className="v-session-check" role="status">
            Checking your session…
          </p>
        ) : (
          <div hidden={workspaceMode !== "review"} className="flex-1 min-h-0">
            <MatterDesk route={route} onNavigate={navigateTo} />
          </div>
        )}
        {locked || isClient ? null : workspaceMode === "vision" ? (
          <VisionPages route={route} />
        ) : workspaceMode === "control" ? (
          <FirmOperations />
        ) : workspaceMode === "review" ? null : (
          <ResearchWorkspace
            onOpenReview={(request) => {
              navigateTo(`/matters/${request.matterId}/${request.section}`);
            }}
          />
        )}
      </main>
    </VisionFrame>
  );
}

export default App;
