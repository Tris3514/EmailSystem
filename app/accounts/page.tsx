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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Settings, X, Pencil, Database, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";

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

const STORAGE_KEY_ACCOUNTS = "email-system-accounts";
const STORAGE_KEY_GOOGLE_SHEETS_ID = "email-system-google-sheets-id";

// Get API base URL
const getApiUrl = () => {
  return process.env.NEXT_PUBLIC_API_URL || "";
};

export default function AccountsPage() {
  // Load accounts from localStorage on mount
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

  // Save accounts to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    }
  }, [accounts]);

  // Add account dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPersonality, setNewAccountPersonality] = useState("");

  // Edit account dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editAccountEmail, setEditAccountEmail] = useState("");
  const [editAccountPersonality, setEditAccountPersonality] = useState("");

  // Email config dialog
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configAccountId, setConfigAccountId] = useState<string | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);

  const syncToGoogleSheets = async () => {
    setSyncingToSheets(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        action: "sync-accounts",
        spreadsheetId: googleSheetsId || undefined,
        accounts: accounts,
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

  const handleAddAccount = () => {
    if (!newAccountName.trim() || !newAccountEmail.trim()) {
      setError("Name and email are required");
      return;
    }

    const newAccount: Account = {
      id: Date.now().toString(),
      name: newAccountName.trim(),
      email: newAccountEmail.trim(),
      personality: newAccountPersonality.trim() || undefined,
    };

    setAccounts([...accounts, newAccount]);
    setNewAccountName("");
    setNewAccountEmail("");
    setNewAccountPersonality("");
    setDialogOpen(false);
    setError(null);
  };

  const openEditDialog = (account: Account) => {
    setEditAccountId(account.id);
    setEditAccountName(account.name);
    setEditAccountEmail(account.email);
    setEditAccountPersonality(account.personality || "");
    setEditDialogOpen(true);
  };

  const handleEditAccount = () => {
    if (!editAccountId || !editAccountName.trim() || !editAccountEmail.trim()) {
      setError("Name and email are required");
      return;
    }

    setAccounts(
      accounts.map((acc) =>
        acc.id === editAccountId
          ? {
              ...acc,
              name: editAccountName.trim(),
              email: editAccountEmail.trim(),
              personality: editAccountPersonality.trim() || undefined,
            }
          : acc
      )
    );

    setEditDialogOpen(false);
    setEditAccountId(null);
    setEditAccountName("");
    setEditAccountEmail("");
    setEditAccountPersonality("");
    setError(null);
  };

  const openConfigDialog = (account: Account) => {
    setConfigAccountId(account.id);
    setSmtpHost(account.emailConfig?.smtpHost || "");
    setSmtpPort(account.emailConfig?.smtpPort?.toString() || "587");
    setSmtpUser(account.emailConfig?.smtpUser || account.email);
    setSmtpPassword(account.emailConfig?.smtpPassword || "");
    setSmtpSecure(account.emailConfig?.smtpSecure || false);
    setConfigDialogOpen(true);
  };

  const handleSaveEmailConfig = () => {
    if (!configAccountId) return;

    const account = accounts.find((acc) => acc.id === configAccountId);
    if (!account) return;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      setError("All SMTP fields are required");
      return;
    }

    const updatedAccounts = accounts.map((acc) => {
      if (acc.id === configAccountId) {
        return {
          ...acc,
          emailConfig: {
            smtpHost,
            smtpPort: parseInt(smtpPort),
            smtpUser,
            smtpPassword,
            smtpSecure,
          },
        };
      }
      return acc;
    });

    setAccounts(updatedAccounts);
    setConfigDialogOpen(false);
    setSuccess("Email configuration saved");
  };

  const handleDeleteAccount = (accountId: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      setAccounts(accounts.filter((acc) => acc.id !== accountId));
      setSuccess("Account deleted");
    }
  };

  return (
    <div
      className="min-h-screen bg-black p-8"
      style={{
        backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" type="button">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">Accounts</h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={syncToGoogleSheets}
              disabled={syncingToSheets || accounts.length === 0}
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
                <CardTitle>Manage Accounts</CardTitle>
                <CardDescription>Create and manage email accounts for conversations</CardDescription>
              </div>
              <Button onClick={() => setDialogOpen(true)} type="button">
                <Plus className="mr-2 h-4 w-4" />
                Add Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No accounts yet. Add one to get started.</p>
                <Button onClick={() => setDialogOpen(true)} type="button">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Account
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="p-4 rounded-lg border border-border hover:border-primary/50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-lg">{account.name}</div>
                        <div className="text-sm text-muted-foreground">{account.email}</div>
                        {account.personality && (
                          <div className="text-xs text-muted-foreground mt-2">{account.personality}</div>
                        )}
                        {account.emailConfig ? (
                          <div className="text-xs text-green-500 mt-2">✓ Email configured</div>
                        ) : (
                          <div className="text-xs text-yellow-500 mt-2">⚠ Email not configured</div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" type="button" onClick={() => openEditDialog(account)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          type="button"
                          onClick={() => openConfigDialog(account)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          type="button"
                          onClick={() => handleDeleteAccount(account.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
            <DialogDescription>Create a new account to participate in conversations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={newAccountEmail}
                onChange={(e) => setNewAccountEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personality">Personality (optional)</Label>
              <Textarea
                id="personality"
                placeholder="Professional and friendly"
                value={newAccountPersonality}
                onChange={(e) => setNewAccountPersonality(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAccount} type="button">
              Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Email Configuration</DialogTitle>
            <DialogDescription>
              Configure SMTP settings for sending emails. Common settings:
              <br />
              Gmail: smtp.gmail.com:587
              <br />
              Outlook: smtp-mail.outlook.com:587
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="smtpHost">SMTP Host</Label>
              <Input
                id="smtpHost"
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPort">SMTP Port</Label>
              <Input
                id="smtpPort"
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => {
                  const port = e.target.value;
                  setSmtpPort(port);
                  const portNum = parseInt(port);
                  if (portNum === 587) {
                    setSmtpSecure(false);
                  } else if (portNum === 465) {
                    setSmtpSecure(true);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Common ports: 587 (STARTTLS), 465 (SSL), 25 (STARTTLS)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpUser">SMTP Username/Email</Label>
              <Input
                id="smtpUser"
                type="email"
                placeholder="your@email.com"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPassword">SMTP Password</Label>
              <Input
                id="smtpPassword"
                type="password"
                placeholder="Your email password or app password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smtpSecure"
                  checked={smtpSecure}
                  disabled={parseInt(smtpPort) === 587}
                  onCheckedChange={(checked) => {
                    const port = parseInt(smtpPort);
                    if (port === 587) {
                      setSmtpSecure(false);
                    } else {
                      setSmtpSecure(checked === true);
                    }
                  }}
                />
                <label htmlFor="smtpSecure" className="text-sm cursor-pointer">
                  Use secure connection (SSL/TLS)
                </label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                {parseInt(smtpPort) === 587
                  ? "Port 587 uses STARTTLS (automatically enabled). Do not check this box."
                  : parseInt(smtpPort) === 465
                  ? "Port 465 requires SSL/TLS. This will be enabled automatically."
                  : "Check this for SSL/TLS connections."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEmailConfig} type="button">
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update the account details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editAccountName">Account Name</Label>
              <Input
                id="editAccountName"
                placeholder="John Doe"
                value={editAccountName}
                onChange={(e) => setEditAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAccountEmail">Email Address</Label>
              <Input
                id="editAccountEmail"
                type="email"
                placeholder="john@example.com"
                value={editAccountEmail}
                onChange={(e) => setEditAccountEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAccountPersonality">Personality (optional)</Label>
              <Textarea
                id="editAccountPersonality"
                placeholder="Describe the account's communication style..."
                value={editAccountPersonality}
                onChange={(e) => setEditAccountPersonality(e.target.value)}
                rows={3}
              />
            </div>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setEditAccountId(null);
                setEditAccountName("");
                setEditAccountEmail("");
                setEditAccountPersonality("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditAccount} type="button">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

