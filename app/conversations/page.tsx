"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, X, Pencil, Database, ExternalLink, ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

interface Message {
  id: string;
  accountId: string;
  accountName: string;
  accountEmail: string;
  content: string;
  timestamp: Date;
  sent?: boolean;
  scheduledSendTime?: Date;
  emailMessageId?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure?: boolean;
}

interface Account {
  id: string;
  name: string;
  email: string;
  personality?: string;
  emailConfig?: EmailConfig;
}

interface Conversation {
  id: string;
  name: string;
  selectedAccount: Account | null;
  otherAccounts: Account[];
  messages: Message[];
  prompt: string;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  conversationLength: number;
  emailSubject?: string;
}

const STORAGE_KEY_ACCOUNTS = "email-system-accounts";
const STORAGE_KEY_CONVERSATIONS = "email-system-conversations";
const STORAGE_KEY_GOOGLE_SHEETS_ID = "email-system-google-sheets-id";

// Get API base URL
const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || "";
};

export default function ConversationsPage() {
  // Load accounts from localStorage
  const [accounts, setAccounts] = useState<Account[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved accounts:", e);
          return [];
        }
      }
    }
    return [];
  });

  // Load conversations from localStorage
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.map((conv: any) => {
            let minDelayMinutes = conv.minDelayMinutes ?? 1;
            let maxDelayMinutes = conv.maxDelayMinutes ?? 5;
            if (conv.delayBetweenMessages !== undefined) {
              const delayMinutes = conv.delayBetweenMessages / 60;
              minDelayMinutes = delayMinutes;
              maxDelayMinutes = delayMinutes;
            }

            return {
              ...conv,
              minDelayMinutes,
              maxDelayMinutes,
              messages: conv.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
                scheduledSendTime: msg.scheduledSendTime ? new Date(msg.scheduledSendTime) : undefined,
                emailMessageId: msg.emailMessageId,
                cost: msg.cost,
                tokens: msg.tokens,
              })),
            };
          });
        } catch (e) {
          console.error("Failed to parse saved conversations:", e);
          return [];
        }
      }
    }
    return [];
  });

  const [googleSheetsId, setGoogleSheetsId] = useState<string | null>(null);
  const [syncingToSheets, setSyncingToSheets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load Google Sheets ID from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedId = localStorage.getItem(STORAGE_KEY_GOOGLE_SHEETS_ID);
      if (savedId) setGoogleSheetsId(savedId);
    }
  }, []);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
    }
  }, [conversations]);

  // Sync conversations to Google Sheets
  const syncToGoogleSheets = async () => {
    setSyncingToSheets(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        action: "sync-conversations",
        spreadsheetId: googleSheetsId || undefined,
        conversations: conversations,
      };

      const response = await fetch(`${getApiUrl()}/api/google-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sync to Google Sheets");
      }

      // Save spreadsheet ID if we got a new one
      if (data.spreadsheetId && data.spreadsheetId !== googleSheetsId) {
        setGoogleSheetsId(data.spreadsheetId);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_GOOGLE_SHEETS_ID, data.spreadsheetId);
        }
      }

      setSuccess(data.message || "Synced to Google Sheets successfully");
    } catch (err: any) {
      setError(err.message || "Failed to sync to Google Sheets");
    } finally {
      setSyncingToSheets(false);
    }
  };

  const handleDeleteConversation = (conversationId: string) => {
    if (confirm("Are you sure you want to delete this conversation?")) {
      setConversations(conversations.filter((conv) => conv.id !== conversationId));
      setSuccess("Conversation deleted");
    }
  };

  const getTotalCost = (conv: Conversation) => {
    return conv.messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
  };

  const getTotalTokens = (conv: Conversation) => {
    return conv.messages.reduce((sum, msg) => sum + (msg.tokens?.total || 0), 0);
  };

  return (
    <div
      className="min-h-screen bg-black p-8"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" type="button">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Conversations</h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={syncToGoogleSheets}
              disabled={syncingToSheets || conversations.length === 0}
              variant="outline"
              type="button"
            >
              {syncingToSheets ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Sync to Google Sheets
                </>
              )}
            </Button>
            {googleSheetsId && (
              <Button variant="outline" asChild type="button">
                <a
                  href={`https://docs.google.com/spreadsheets/d/${googleSheetsId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Spreadsheet
                </a>
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-md mb-4">
            {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>All Conversations</CardTitle>
                <CardDescription>
                  View and manage all conversations. Go to the main page to create and edit conversations.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No conversations yet.</p>
                <Link href="/">
                  <Button type="button">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Conversation
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {conversations.map((conv) => {
                  const totalCost = getTotalCost(conv);
                  const totalTokens = getTotalTokens(conv);
                  const sentCount = conv.messages.filter((m) => m.sent).length;

                  return (
                    <div key={conv.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-2">{conv.name}</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Messages:</span> {conv.messages.length}
                            </div>
                            <div>
                              <span className="font-medium">Sent:</span> {sentCount}
                            </div>
                            {totalCost > 0 && (
                              <div>
                                <span className="font-medium">Cost:</span> ${totalCost.toFixed(4)}
                              </div>
                            )}
                            {totalTokens > 0 && (
                              <div>
                                <span className="font-medium">Tokens:</span> {totalTokens.toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            <div>
                              <span className="font-medium">Selected Account:</span>{" "}
                              {conv.selectedAccount?.name || conv.selectedAccount?.email || "None"}
                            </div>
                            <div>
                              <span className="font-medium">Other Accounts:</span>{" "}
                              {conv.otherAccounts.length > 0
                                ? conv.otherAccounts.map((a) => a.name || a.email).join(", ")
                                : "None"}
                            </div>
                            {conv.emailSubject && (
                              <div>
                                <span className="font-medium">Email Subject:</span> {conv.emailSubject}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/?conversation=${conv.id}`}>
                            <Button variant="outline" size="sm" type="button">
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => handleDeleteConversation(conv.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Messages Preview */}
                      {conv.messages.length > 0 && (
                        <div className="mt-4 border-t border-border pt-4">
                          <h4 className="text-sm font-medium mb-2">Messages ({conv.messages.length})</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {conv.messages.slice(0, 5).map((msg) => (
                              <div key={msg.id} className="text-sm border-l-2 border-primary pl-3 py-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{msg.accountName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(msg.timestamp).toLocaleString()}
                                    {msg.sent && " • Sent"}
                                  </span>
                                </div>
                                <p className="text-muted-foreground mt-1 line-clamp-2">{msg.content}</p>
                              </div>
                            ))}
                            {conv.messages.length > 5 && (
                              <p className="text-xs text-muted-foreground text-center">
                                +{conv.messages.length - 5} more messages
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

