import { useState, useEffect, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import {
  FileText,
  Shield,
  Upload,
  Send,
  Plus,
  Scale,
  ChevronRight,
  FolderOpen,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Search,
  Menu,
  LogOut,
  Settings,
  BarChart2,
  FileEdit,
  Trash2,
  Download,
  Lock,
  Unlock,
  RefreshCw,
  X,
  ExternalLink,
  Briefcase,
  Globe,
  Building2,
  Cloud,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import FirmOperations from "@/components/FirmOperations";
import MatterDesk from "@/components/MatterDesk";
import ResearchWorkspace from "@/components/ResearchWorkspace";
import {
  VisionFrame,
  VisionNavigation as WorkspaceNavigation,
  VisionHeader,
} from "@/components/vision/VisionShell";
import VisionPages from "@/components/vision/VisionPages";
import { readRoute, navigateTo } from "@/lib/workspaceNavigation";
import { serverMode, useSession } from "@/lib/session";
import "@/components/PortfolioShell.css";
import "@/components/vision/Vision.css";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Jurisdictions
const JURISDICTIONS = [
  { value: "NIGERIA (CAMA 2020)", label: "Nigeria (CAMA 2020)" },
  { value: "US (DELAWARE DGCL)", label: "US (Delaware DGCL)" },
  { value: "UK (Companies Act 2006)", label: "UK (Companies Act 2006)" },
  { value: "CROSS-BORDER", label: "Cross-Border Transaction" },
];

// Document folders
const FOLDERS = [
  { value: "Legal_Drafts", label: "Legal Drafts", icon: FileEdit },
  { value: "Due_Diligence", label: "Due Diligence", icon: Search },
  { value: "CBRNE_Technical", label: "Technical Documents", icon: Settings },
  { value: "KYC_Docs", label: "KYC Documents", icon: Shield },
];

// Format file size
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

// Format date
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    compliant: { className: "badge-compliant", label: "COMPLIANT" },
    pending: { className: "badge-pending", label: "PENDING" },
    overdue: { className: "badge-overdue", label: "OVERDUE" },
    stored: { className: "badge-indexed", label: "STORED · NOT ANALYZED" },
    indexed: { className: "badge-indexed", label: "LEGACY · NOT VERIFIED" },
    processing: { className: "badge-pending", label: "PROCESSING" },
  };
  const { className, label } = config[status] || config.pending;
  return (
    <span
      className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-sm ${className}`}
    >
      {label}
    </span>
  );
};

// Law Suite logo
const LawSuiteLogo = () => (
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-sm bg-[var(--accent-gold-dim)] flex items-center justify-center border border-[var(--border-color)]">
      <Scale className="w-4 h-4 text-[var(--primary)]" />
    </div>
    <div>
      <h1 className="font-serif text-lg font-semibold text-[var(--foreground)]">
        Law Suite
      </h1>
      <p className="text-[10px] text-[var(--foreground-muted)] tracking-wider">
        Matter workspace
      </p>
    </div>
  </div>
);

// Storage Badge
const StorageBadge = ({ useFirebase }) => (
  <div className="flex items-center gap-1 px-2 py-1 rounded-sm bg-[var(--panel-raised)] text-[var(--steel-soft)] border border-[var(--border-color)]">
    {useFirebase ? (
      <Cloud className="w-3 h-3" />
    ) : (
      <Database className="w-3 h-3" />
    )}
    <span className="text-[9px] font-medium">PROTOTYPE</span>
  </div>
);

// Sidebar Component
const Sidebar = ({
  dealRooms,
  selectedDealRoom,
  onSelectDealRoom,
  onCreateDealRoom,
  complianceItems,
  onUpdateCompliance,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newDealName, setNewDealName] = useState("");
  const [newJurisdiction, setNewJurisdiction] = useState("US (DELAWARE DGCL)");

  const handleCreate = async () => {
    if (!newDealName.trim()) return;
    await onCreateDealRoom(newDealName, newJurisdiction);
    setNewDealName("");
    setIsCreating(false);
  };

  const handleStatusClick = async (item) => {
    const statusCycle = ["pending", "compliant", "overdue"];
    const currentIndex = statusCycle.indexOf(item.status);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
    await onUpdateCompliance(item.id, nextStatus);
  };

  return (
    <aside className="connected-sidebar">
      {/* Collection heading */}
      <div className="p-4 border-b border-[var(--navy-light)]">
        <span className="research-kicker">MATTER COLLECTIONS</span>
        <p className="text-xs text-[var(--foreground-muted)] mt-2">
          Your connected workspace
        </p>
      </div>

      {/* Active Matters */}
      <div className="p-4 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-muted)]">
            Active Matters
          </span>
        </div>

        {/* New Matter Button */}
        {!isCreating ? (
          <Button
            data-testid="new-matter-btn"
            onClick={() => setIsCreating(true)}
            className="w-full mb-4 btn-primary rounded-sm h-9 text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Matter
          </Button>
        ) : (
          <div className="mb-4 p-3 bg-[var(--background-secondary)] rounded-sm border border-[var(--navy-light)] animate-fade-in">
            <Input
              data-testid="new-matter-name-input"
              value={newDealName}
              onChange={(e) => setNewDealName(e.target.value)}
              placeholder="Deal name..."
              className="input-advisory mb-2 h-8 text-sm"
              autoFocus
            />
            <Select value={newJurisdiction} onValueChange={setNewJurisdiction}>
              <SelectTrigger
                data-testid="new-matter-jurisdiction-select"
                className="input-advisory h-8 text-sm mb-2"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j.value} value={j.value}>
                    {j.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                data-testid="create-matter-btn"
                onClick={handleCreate}
                className="flex-1 btn-primary rounded-sm h-7 text-xs"
                disabled={!newDealName.trim()}
              >
                Create
              </Button>
              <Button
                data-testid="cancel-create-btn"
                onClick={() => setIsCreating(false)}
                variant="ghost"
                className="h-7 text-xs px-2"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Deal Rooms List */}
        <ScrollArea className="flex-1 -mx-2">
          <div className="px-2 space-y-1">
            {dealRooms.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)] text-center py-4">
                No active matters
              </p>
            ) : (
              dealRooms.map((deal) => (
                <button
                  key={deal.id}
                  data-testid={`deal-room-${deal.id}`}
                  onClick={() => onSelectDealRoom(deal)}
                  className={`w-full text-left p-3 rounded-sm transition-all ${
                    selectedDealRoom?.id === deal.id
                      ? "bg-[var(--accent-gold-dim)] border border-[var(--border-color)]"
                      : "hover:bg-[var(--background-secondary)] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="w-3 h-3 text-[var(--primary)]" />
                    <span className="text-sm font-medium truncate">
                      {deal.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--foreground-muted)] truncate">
                    {deal.jurisdiction}
                  </p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Statutory Tracker */}
        <div className="mt-4 pt-4 border-t border-[var(--navy-light)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground-muted)]">
              Statutory Tracker
            </span>
            <RefreshCw className="w-3 h-3 text-[var(--foreground-muted)]" />
          </div>
          <ScrollArea className="h-[180px] -mx-2">
            <div className="px-2 space-y-2">
              {complianceItems.length === 0 ? (
                <p className="text-xs text-[var(--foreground-muted)] text-center py-4">
                  Select a matter to view compliance
                </p>
              ) : (
                complianceItems.map((item) => (
                  <div
                    key={item.id}
                    className={`compliance-item ${item.status} p-2 bg-[var(--background-secondary)] rounded-sm cursor-pointer hover:bg-[var(--background-tertiary)] transition-colors`}
                    onClick={() => handleStatusClick(item)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate flex-1">
                        {item.name}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.regulatory_body && (
                      <p className="text-[10px] text-[var(--foreground-muted)]">
                        {item.regulatory_body}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          {complianceItems.length > 0 && (
            <p className="text-[10px] text-[var(--foreground-muted)] text-center mt-2">
              Click status to cycle through states
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

const Header = ({ route, activeTab, setActiveTab }) => (
  <header className="portfolio-header">
    <span>
      WORKSPACE <ChevronRight size={13} />{" "}
      <b>
        {
          {
            dashboard: "OVERVIEW",
            matters: "MATTER PORTFOLIO",
            detail: "MATTER REVIEW",
            research: "RESEARCH & DOCUMENTS",
            operations: "FIRM OPERATIONS",
          }[route.page]
        }
      </b>
    </span>
    <div>
      {route.workspace === "workspace" && BACKEND_URL && (
        <button
          className="desk-button secondary"
          onClick={() =>
            setActiveTab(activeTab === "records" ? "audit" : "records")
          }
        >
          {activeTab === "records" ? "View activity" : "View documents"}
        </button>
      )}
      <span className="portfolio-preview-label">PRODUCT PREVIEW</span>
      <span className="portfolio-avatar">LS</span>
    </div>
  </header>
);

// Chat Message Component
const ChatMessage = ({ message, isUser }) => (
  <div className={`animate-fade-in ${isUser ? "flex justify-end" : ""}`}>
    <div
      className={`max-w-[90%] p-4 ${isUser ? "chat-message-user" : "chat-message-assistant"}`}
    >
      {!isUser && message.reference_id && (
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border-color)]">
          <span className="font-serif text-xs text-[var(--primary)]">
            LAW SUITE RESEARCH
          </span>
          <span className="text-[10px] text-[var(--foreground-muted)]">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}
      <div className="prose-advisory text-sm whitespace-pre-wrap">
        {message.content}
      </div>
      {!isUser && message.reference_id && (
        <div className="mt-3 pt-2 border-t border-[var(--border-color)] flex items-center gap-2 text-[10px] text-[var(--foreground-muted)]">
          <span>REF: {message.reference_id}</span>
          <span>•</span>
          <span>STATUS: ADVISORY</span>
        </div>
      )}
    </div>
  </div>
);

// Chat Panel Component
const ChatPanel = ({ selectedDealRoom, jurisdiction, setJurisdiction }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          content: `Law Suite Research prepares unverified drafts for lawyer review. Document contents and current legal authorities are not connected in this prototype. Use synthetic information only; verify every legal proposition independently.`,
          isUser: false,
          reference_id: "LAW-INIT",
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = {
      id: Date.now().toString(),
      content: inputValue,
      isUser: true,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        deal_room_id: selectedDealRoom?.id || null,
        message: inputValue,
        jurisdiction: jurisdiction,
      });

      const assistantMessage = {
        id: Date.now().toString() + "_response",
        content: response.data.response,
        isUser: false,
        reference_id: response.data.reference_id,
        timestamp: response.data.timestamp,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(
        "Research service is unavailable. No legal answer was generated.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="connected-chat flex flex-col h-full">
      <header className="connected-chat-heading">
        <div>
          <span className="research-kicker">RESEARCH WORKSPACE</span>
          <h2>{selectedDealRoom?.name || "Explore a research question"}</h2>
        </div>
        <span className="research-badge">
          <FileEdit size={13} /> Unverified drafts
        </span>
      </header>
      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} isUser={msg.isUser} />
          ))}
          {messages.length === 1 && (
            <div className="research-starters">
              <span>START WITH A QUESTION</span>
              {[
                "Outline a diligence checklist for a fictional acquisition.",
                "What evidence should a lawyer gather before reviewing consent requirements?",
                "Create a research plan with questions for independent authority checks.",
              ].map((question) => (
                <button key={question} onClick={() => setInputValue(question)}>
                  {question}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          )}
          {isLoading && (
            <div className="chat-message-assistant p-4 max-w-[90%]">
              <div className="flex items-center gap-2">
                <span className="font-serif text-xs text-[var(--primary)]">
                  LAW SUITE RESEARCH
                </span>
                <div className="typing-indicator flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full"></span>
                  <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full"></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-4 border-t border-[var(--navy-light)] bg-[var(--background)]">
        <div className="max-w-3xl mx-auto">
          <div className="bg-[var(--background-secondary)] rounded-sm border border-[var(--navy-light)] p-3">
            <Textarea
              data-testid="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question using fictional matter details…"
              className="min-h-[60px] max-h-[120px] bg-transparent border-0 resize-none focus:ring-0 text-sm"
              disabled={isLoading}
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--navy-light)]">
              <div className="flex items-center gap-2">
                <Select value={jurisdiction} onValueChange={setJurisdiction}>
                  <SelectTrigger
                    data-testid="jurisdiction-select"
                    className="input-advisory h-8 w-[180px] text-xs"
                  >
                    <Globe className="w-3 h-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JURISDICTIONS.map((j) => (
                      <SelectItem key={j.value} value={j.value}>
                        {j.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                aria-label="Send research question"
                data-testid="send-message-btn"
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="btn-primary rounded-sm h-8 px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-center mt-2 text-[var(--foreground-muted)]">
            Unverified research drafts · No document-text analysis or
            current-law verification.
          </p>
        </div>
      </div>
    </div>
  );
};

// Document Records Component
const DocumentRecords = ({
  selectedDealRoom,
  documents,
  onUpload,
  onDelete,
  onRefresh,
  isUploading,
  uploadProgress,
  useFirebaseStorage,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("Legal_Drafts");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await onUpload(file, selectedFolder);
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await onUpload(file, selectedFolder);
    }
    e.target.value = "";
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.file_name
      ?.toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--navy-light)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--ice)]">
              Document Records
            </h3>
            <StorageBadge useFirebase={useFirebaseStorage} />
          </div>
          <button
            aria-label="Refresh documents"
            onClick={onRefresh}
            className="p-1 hover:bg-[var(--background-secondary)] rounded-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-[var(--foreground-muted)]" />
          </button>
        </div>

        {/* Folder selector */}
        <Select value={selectedFolder} onValueChange={setSelectedFolder}>
          <SelectTrigger className="input-advisory h-8 text-xs mb-3">
            <FolderOpen className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLDERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Drop zone */}
        <div
          data-testid="document-drop-zone"
          role="button"
          tabIndex={0}
          aria-label="Upload synthetic documents"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!isUploading) fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`drop-zone p-4 rounded-sm text-center cursor-pointer transition-all ${
            isDragging ? "active" : ""
          } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isUploading ? (
            <div className="space-y-2">
              <Cloud className="w-6 h-6 mx-auto text-[var(--primary)] animate-pulse" />
              <p className="text-xs text-[var(--foreground-muted)]">
                {useFirebaseStorage
                  ? "Uploading to Firebase Storage..."
                  : "Uploading to MongoDB..."}
              </p>
              <Progress value={uploadProgress} className="h-1" />
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--foreground-muted)]" />
              <p className="text-xs text-[var(--foreground-muted)]">
                Drag & Drop Legal Briefs
              </p>
              <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
                Synthetic files only · 10 MiB maximum · Storage only
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.docx,.doc,.csv,.xlsx,.txt"
            disabled={isUploading}
          />
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <Input
            data-testid="document-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stored filenames..."
            className="input-advisory h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Documents list */}
      <ScrollArea className="flex-1 p-4">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--foreground-muted)] opacity-50" />
            <p className="text-xs text-[var(--foreground-muted)]">
              {selectedDealRoom
                ? "No documents uploaded yet"
                : "Select a matter to view documents"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                data-testid={`document-${doc.id}`}
                className="doc-card p-3 rounded-sm"
              >
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-sm bg-[var(--accent-gold-dim)] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-[var(--primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {doc.file_name}
                      </span>
                      <StatusBadge status={doc.indexing_status || "stored"} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--foreground-muted)]">
                      <span>v{doc.version || "1.0"}</span>
                      <span>{formatDate(doc.uploaded_at)}</span>
                      <span>{formatFileSize(doc.file_size)}</span>
                    </div>
                    {doc.download_url && (
                      <a
                        href={doc.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[var(--primary)] hover:underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View in Firebase
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Delete ${doc.file_name}`}
                      onClick={() => onDelete(doc.id)}
                      className="p-1 hover:bg-[var(--background)] rounded-sm transition-colors"
                    >
                      <Trash2 className="w-3 h-3 text-[var(--foreground-muted)]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

// Audit Trail Component
const AuditTrail = ({ selectedDealRoom, auditData }) => {
  if (!selectedDealRoom) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--foreground-muted)]">
          Select a matter to view audit trail
        </p>
      </div>
    );
  }

  const allEvents = [
    ...(auditData.advisory_logs || []).map((log) => ({
      type: "advisory",
      title:
        log.type === "legal_opinion" ? "Legal Opinion" : "Strategic Directive",
      content: (log.content || "").substring(0, 100) + "...",
      timestamp: log.timestamp,
    })),
    ...(auditData.document_uploads || []).map((doc) => ({
      type: "document",
      title: `Document Uploaded: ${doc.file_name}`,
      content: `Folder: ${doc.folder} | Hash: ${(doc.file_hash || "").substring(0, 8)}...`,
      timestamp: doc.uploaded_at,
    })),
    ...(auditData.compliance_updates || []).map((cl) => ({
      type: "compliance",
      title: `Compliance: ${cl.name}`,
      content: `Status: ${(cl.status || "pending").toUpperCase()}`,
      timestamp: cl.updated_at || cl.created_at,
    })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-[var(--navy-light)]">
        <h3 className="text-base font-semibold text-[var(--ice)]">
          Activity history
        </h3>
        <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
          Complete transaction history
        </p>
      </div>
      <ScrollArea className="flex-1 p-4">
        {allEvents.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 mx-auto mb-2 text-[var(--foreground-muted)] opacity-50" />
            <p className="text-xs text-[var(--foreground-muted)]">
              No audit events yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allEvents.map((event, idx) => (
              <div
                key={idx}
                className="p-3 bg-[var(--background-secondary)] rounded-sm border-l-2 border-[var(--primary)]"
              >
                <div className="flex items-center gap-2 mb-1">
                  {event.type === "advisory" && (
                    <Scale className="w-3 h-3 text-[var(--primary)]" />
                  )}
                  {event.type === "document" && (
                    <FileText className="w-3 h-3 text-[var(--status-info)]" />
                  )}
                  {event.type === "compliance" && (
                    <CheckCircle className="w-3 h-3 text-[var(--status-success)]" />
                  )}
                  <span className="text-xs font-medium">{event.title}</span>
                </div>
                <p className="text-[10px] text-[var(--foreground-muted)] mb-1">
                  {event.content}
                </p>
                <span className="text-[10px] text-[var(--foreground-muted)]">
                  {event.timestamp
                    ? new Date(event.timestamp).toLocaleString()
                    : "N/A"}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

// Main App Component
function App() {
  const [dealRooms, setDealRooms] = useState([]);
  const [selectedDealRoom, setSelectedDealRoom] = useState(null);
  const [complianceItems, setComplianceItems] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [auditData, setAuditData] = useState({
    advisory_logs: [],
    document_uploads: [],
    compliance_updates: [],
  });
  const [activeTab, setActiveTab] = useState("records");
  const [jurisdiction, setJurisdiction] = useState("US (DELAWARE DGCL)");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const useFirebaseStorage = false; // External storage is disabled pending authorization.
  // Lead with the local practitioner demo; load the optional API only on request.
  const [route, setRoute] = useState(readRoute);
  const workspaceMode = route.workspace;
  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  // With a live API the workspace opens only after sign-in; the public demo stays open.
  const session = useSession();
  const onAuthPage = route.workspace === "vision" && route.page.startsWith("sign-");
  const locked = serverMode && session.status !== "signed-in" && !onAuthPage;
  useEffect(() => {
    if (locked && session.status === "signed-out")
      navigateTo("/authentication/sign-in/basic");
  }, [locked, session.status, route]);

  // Fetch deal rooms
  const fetchDealRooms = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/deal-rooms`);
      setDealRooms(response.data);
    } catch (error) {
      console.error("Error fetching deal rooms:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch compliance items
  const fetchCompliance = useCallback(async (dealRoomId) => {
    try {
      const response = await axios.get(
        `${API}/compliance-checklists/${dealRoomId}`,
      );
      setComplianceItems(response.data);
    } catch (error) {
      console.error("Error fetching compliance:", error);
    }
  }, []);

  // Fetch documents
  const fetchDocuments = useCallback(async (dealRoomId) => {
    try {
      const response = await axios.get(`${API}/documents/${dealRoomId}`);
      setDocuments(response.data);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  }, []);

  // Fetch audit trail
  const fetchAuditTrail = useCallback(async (dealRoomId) => {
    try {
      const response = await axios.get(`${API}/audit-trail/${dealRoomId}`);
      setAuditData(response.data);
    } catch (error) {
      console.error("Error fetching audit trail:", error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (workspaceMode === "workspace" && BACKEND_URL) {
      fetchDealRooms();
    }
  }, [fetchDealRooms, workspaceMode]);

  // Load deal room data when selected
  useEffect(() => {
    if (selectedDealRoom) {
      fetchCompliance(selectedDealRoom.id);
      fetchDocuments(selectedDealRoom.id);
      fetchAuditTrail(selectedDealRoom.id);
      setJurisdiction(selectedDealRoom.jurisdiction);
    } else {
      setComplianceItems([]);
      setDocuments([]);
      setAuditData({
        advisory_logs: [],
        document_uploads: [],
        compliance_updates: [],
      });
    }
  }, [selectedDealRoom, fetchCompliance, fetchDocuments, fetchAuditTrail]);

  // Create deal room
  const handleCreateDealRoom = async (name, jurisdiction) => {
    try {
      const response = await axios.post(`${API}/deal-rooms`, {
        name,
        jurisdiction,
      });
      setDealRooms((prev) => [...prev, response.data]);
      setSelectedDealRoom(response.data);
      toast.success("Deal room created");
    } catch (error) {
      console.error("Error creating deal room:", error);
      toast.error("Failed to create deal room");
    }
  };

  // Update compliance status
  const handleUpdateCompliance = async (checklistId, status) => {
    try {
      const formData = new FormData();
      formData.append("status", status);
      await axios.put(`${API}/compliance-checklists/${checklistId}`, formData);
      if (selectedDealRoom) {
        await fetchCompliance(selectedDealRoom.id);
        await fetchAuditTrail(selectedDealRoom.id);
      }
      toast.success(`Status updated to ${status}`);
    } catch (error) {
      console.error("Error updating compliance:", error);
      toast.error("Failed to update status");
    }
  };

  // Synthetic-data prototype: one bounded backend upload, no external storage fallback.
  const handleUploadDocument = async (file, folder) => {
    if (!selectedDealRoom) {
      toast.error("Select a matter first");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("The prototype upload limit is 10 MiB");
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("deal_room_id", selectedDealRoom.id);
      formData.append("folder", folder);
      await axios.post(API + "/documents/upload", formData, {
        onUploadProgress: (event) =>
          setUploadProgress(
            event.total ? Math.round((event.loaded / event.total) * 100) : 0,
          ),
      });
      toast.success("Document stored. Contents have not been analyzed.");
      await fetchDocuments(selectedDealRoom.id);
      await fetchAuditTrail(selectedDealRoom.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete document
  const handleDeleteDocument = async (documentId) => {
    try {
      await axios.delete(`${API}/documents/${documentId}`);
      toast.success("Document deleted");
      if (selectedDealRoom) {
        await fetchDocuments(selectedDealRoom.id);
        await fetchAuditTrail(selectedDealRoom.id);
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  return (
    <VisionFrame>
      <Toaster position="top-right" richColors />
      <WorkspaceNavigation route={route} />

      {/* Main content */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header */}
        <VisionHeader
          route={route}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {locked ? (
          <p className="v-session-check" role="status">
            Checking your session…
          </p>
        ) : (
          <div hidden={workspaceMode !== "review"} className="flex-1 min-h-0">
            <MatterDesk route={route} onNavigate={navigateTo} />
          </div>
        )}
        {locked ? null : workspaceMode === "vision" ? (
          <VisionPages route={route} />
        ) : workspaceMode === "control" ? (
          <FirmOperations />
        ) : workspaceMode === "review" ? null : !BACKEND_URL ? (
          <ResearchWorkspace
            onOpenReview={(request) => {
              navigateTo(`/matters/${request.matterId}/${request.section}`);
            }}
          />
        ) : (
          /* Content area */
          <div className="connected-workspace flex-1 flex min-h-0">
            <Sidebar
              dealRooms={dealRooms}
              selectedDealRoom={selectedDealRoom}
              onSelectDealRoom={setSelectedDealRoom}
              onCreateDealRoom={handleCreateDealRoom}
              complianceItems={complianceItems}
              onUpdateCompliance={handleUpdateCompliance}
            />
            {/* Chat panel */}
            <div className="flex-1 min-w-0 min-h-[500px]">
              <ChatPanel
                key={`${selectedDealRoom?.id || "global"}:${jurisdiction}`}
                selectedDealRoom={selectedDealRoom}
                jurisdiction={jurisdiction}
                setJurisdiction={setJurisdiction}
              />
            </div>

            {/* Right panel (Records/Audit) */}
            <div className="connected-records">
              {activeTab === "records" ? (
                <DocumentRecords
                  selectedDealRoom={selectedDealRoom}
                  documents={documents}
                  onUpload={handleUploadDocument}
                  onDelete={handleDeleteDocument}
                  onRefresh={() =>
                    selectedDealRoom && fetchDocuments(selectedDealRoom.id)
                  }
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                  useFirebaseStorage={useFirebaseStorage}
                />
              ) : (
                <AuditTrail
                  selectedDealRoom={selectedDealRoom}
                  auditData={auditData}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </VisionFrame>
  );
}

export default App;
