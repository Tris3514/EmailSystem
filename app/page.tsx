"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Mail, Settings, X, Pencil, CheckCircle2, Clock, Trash2, Database, ExternalLink } from "lucide-react";

interface Message {
  id: string;
  accountId: string;
  accountName: string;
  accountEmail: string;
  content: string;
  timestamp: Date;
  sent?: boolean;
  scheduledSendTime?: Date; // When this message is scheduled to be sent
  emailMessageId?: string; // The Message-ID from the email server (for threading)
  cost?: number; // Estimated cost in USD
  tokens?: { // Token usage tracking
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
  minDelayMinutes: number; // Minimum delay in minutes between sending messages
  maxDelayMinutes: number; // Maximum delay in minutes between sending messages
  conversationLength: number; // Number of messages to generate in full conversation
  emailSubject?: string; // Unique subject line for this conversation's email thread
}

const STORAGE_KEY_ACCOUNTS = "email-system-accounts";
const STORAGE_KEY_CONVERSATIONS = "email-system-conversations";
const STORAGE_KEY_GOOGLE_SHEETS_ID = "email-system-google-sheets-id";

// Get API base URL - use environment variable or default to relative path
// On Vercel, API routes are on the same domain, so use relative paths
const getApiUrl = () => {
  // If NEXT_PUBLIC_API_URL is set (for GitHub Pages), use it
  // Otherwise use relative paths (works for Vercel and local dev)
  return process.env.NEXT_PUBLIC_API_URL || "";
};

export default function Home() {
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

  // Load conversations from localStorage on mount
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Convert timestamp strings back to Date objects and migrate old delay format
          return parsed.map((conv: any) => {
            // Migrate old delayBetweenMessages to minDelayMinutes/maxDelayMinutes
            let minDelayMinutes = conv.minDelayMinutes ?? 1;
            let maxDelayMinutes = conv.maxDelayMinutes ?? 5;
            if (conv.delayBetweenMessages !== undefined) {
              // Convert seconds to minutes, use same value for min and max
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
                 emailMessageId: msg.emailMessageId, // Preserve Message-ID for threading
                 cost: msg.cost, // Preserve cost
                 tokens: msg.tokens, // Preserve tokens
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

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"conversations" | "accounts" | "database">("conversations");
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [googleSheetsId, setGoogleSheetsId] = useState<string | null>(null);
  const [syncingToSheets, setSyncingToSheets] = useState(false);

  // Save accounts to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
    }
  }, [accounts]);

  // Save conversations to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(conversations));
    }
  }, [conversations]);
  
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
  
  // New conversation name dialog
  const [newConversationDialogOpen, setNewConversationDialogOpen] = useState(false);
  const [newConversationName, setNewConversationName] = useState("");
  
  // Rename conversation dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [renameConversationName, setRenameConversationName] = useState("");

  // Countdown timer state for scheduled messages
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper function to format countdown
  const getCountdown = useCallback((scheduledTime: Date | undefined): string | null => {
    if (!scheduledTime) return null;
    const now = currentTime.getTime();
    const scheduled = scheduledTime.getTime();
    const diff = scheduled - now;
    
    // If scheduled time has passed (more than 5 seconds ago), don't show countdown
    // This handles cases where scheduled time was set but message wasn't sent
    if (diff <= -5000) return null;
    
    if (diff <= 0) return "Sending...";
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, [currentTime]);

  const getActiveConversation = (): Conversation | null => {
    if (!activeConversationId) return null;
    return conversations.find(c => c.id === activeConversationId) || null;
  };

  const updateActiveConversation = (updater: (conv: Conversation) => Conversation) => {
    if (!activeConversationId) return;
    setConversations(convs => convs.map(c => 
      c.id === activeConversationId ? updater(c) : c
    ));
  };

  const createNewConversation = () => {
    setNewConversationName("");
    setNewConversationDialogOpen(true);
  };

  const handleCreateConversationWithName = () => {
    if (!newConversationName.trim()) {
      setError("Conversation name is required");
      return;
    }

    const newConv: Conversation = {
      id: Date.now().toString(),
      name: newConversationName.trim(),
      selectedAccount: null,
      otherAccounts: [],
      messages: [],
      prompt: "",
      minDelayMinutes: 1, // Default 1 minute minimum
      maxDelayMinutes: 5, // Default 5 minutes maximum
      conversationLength: 6, // Default 6 messages (3 back and forth)
      emailSubject: `Conversation: ${newConversationName.trim()}`, // Unique subject for this conversation
    };
    setConversations([...conversations, newConv]);
    setActiveConversationId(newConv.id);
    setNewConversationDialogOpen(false);
    setNewConversationName("");
    setError(null);
  };

  const openRenameDialog = (conv: Conversation) => {
    setRenameConversationId(conv.id);
    setRenameConversationName(conv.name);
    setRenameDialogOpen(true);
  };

  const handleRenameConversation = () => {
    if (!renameConversationId || !renameConversationName.trim()) {
      setError("Conversation name is required");
      return;
    }

    setConversations(convs => convs.map(c => 
      c.id === renameConversationId 
        ? { ...c, name: renameConversationName.trim() }
        : c
    ));
    setRenameDialogOpen(false);
    setRenameConversationId(null);
    setRenameConversationName("");
    setError(null);
  };

  const handleGenerateMessage = async () => {
    const conv = getActiveConversation();
    if (!conv) {
      setError("Please create or select a conversation");
      return;
    }

    if (!conv.selectedAccount) {
      setError("Please select an account");
      return;
    }

    if (conv.otherAccounts.length === 0) {
      setError("Please add at least one other account to the conversation");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/generate-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: conv.selectedAccount,
          otherAccounts: conv.otherAccounts,
          conversationHistory: conv.messages,
          prompt: conv.prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate message");
      }

      if (!data.message || data.message.trim() === "") {
        throw new Error("Received empty message from API. Please try again.");
      }

      const newMessage: Message = {
        id: Date.now().toString(),
        accountId: conv.selectedAccount.id,
        accountName: conv.selectedAccount.name,
        accountEmail: conv.selectedAccount.email,
        content: data.message,
        timestamp: new Date(),
        cost: data.usage?.cost,
        tokens: data.usage ? {
          input: data.usage.inputTokens,
          output: data.usage.outputTokens,
          total: data.usage.totalTokens,
        } : undefined,
      };

      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, newMessage],
        prompt: "",
      }));
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailInternal = async (message: Message, senderAccount: Account, recipients: Account[], conversationSubject: string, conversationId: string, previousMessageId?: string) => {
    const recipientsList = recipients.map(acc => acc.email).join(", ");
    // Add "Re: " prefix if this is a reply (not the first message)
    const subject = previousMessageId ? (conversationSubject.startsWith("Re: ") ? conversationSubject : `Re: ${conversationSubject}`) : conversationSubject;

    const response = await fetch(`${getApiUrl()}/api/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderAccount.name,
        to: recipientsList,
        subject,
        text: message.content,
        html: `<p>${message.content.replace(/\n/g, '<br>')}</p>`,
        accountConfig: {
          email: senderAccount.email,
          ...senderAccount.emailConfig,
        },
        conversationId: conversationId, // Pass conversation ID for threading
        previousMessageId: previousMessageId, // Pass previous message's Message-ID for threading
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to send email");
    }

    return data;
  };

  const handleSendEmail = async (message: Message, account?: Account) => {
    const conv = getActiveConversation();
    if (!conv) {
      setError("Please select a conversation");
      return;
    }

    const senderAccount = account || conv.selectedAccount;
    if (!senderAccount || !senderAccount.emailConfig) {
      setError("Please configure email settings for this account");
      return;
    }

    if (conv.otherAccounts.length === 0) {
      setError("Please select at least one recipient");
      return;
    }

    setSendingEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const recipients = conv.otherAccounts;
      // Use conversation's unique subject, or generate one if it doesn't exist
      const subject = conv.emailSubject || `Conversation: ${conv.name}`;
      
      // Find the previous sent message in this conversation to get its Message-ID
      const sentMessages = conv.messages.filter(m => m.sent && m.emailMessageId);
      const previousMessage = sentMessages.length > 0 ? sentMessages[sentMessages.length - 1] : undefined;
      
      const result = await sendEmailInternal(message, senderAccount, recipients, subject, conv.id, previousMessage?.emailMessageId);
      
      // Mark message as sent and store the Message-ID
      updateActiveConversation(c => ({
        ...c,
        messages: c.messages.map(m => 
          m.id === message.id ? { ...m, sent: true, scheduledSendTime: undefined, emailMessageId: result.messageId } : m
        ),
      }));
      
      setSuccess(`Email sent successfully to ${recipients.map(r => r.email).join(", ")}`);
    } catch (err: any) {
      setError(err.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleGenerateFullConversation = async () => {
    const conv = getActiveConversation();
    if (!conv) {
      setError("Please create or select a conversation");
      return;
    }

    if (!conv.selectedAccount) {
      setError("Please select a sender account");
      return;
    }

    if (conv.otherAccounts.length === 0) {
      setError("Please add at least one participant to the conversation");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const allParticipants = [conv.selectedAccount, ...conv.otherAccounts];
    const newMessages: Message[] = [];
    let currentHistory = [...conv.messages];

    try {
      // Generate conversation back and forth
      for (let i = 0; i < conv.conversationLength; i++) {
        // Alternate between participants
        const senderIndex = i % allParticipants.length;
        const sender = allParticipants[senderIndex];
        const otherParticipants = allParticipants.filter((_, idx) => idx !== senderIndex);

        const response = await fetch(`${getApiUrl()}/api/generate-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: sender,
            otherAccounts: otherParticipants,
            conversationHistory: currentHistory,
            prompt: conv.prompt,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to generate message");
        }

        if (!data.message || data.message.trim() === "") {
          throw new Error("Received empty message from API. Please try again.");
        }

        const newMessage: Message = {
          id: Date.now().toString() + i,
          accountId: sender.id,
          accountName: sender.name,
          accountEmail: sender.email,
          content: data.message,
          timestamp: new Date(),
          cost: data.usage?.cost,
          tokens: data.usage ? {
            input: data.usage.inputTokens,
            output: data.usage.outputTokens,
            total: data.usage.totalTokens,
          } : undefined,
        };

        newMessages.push(newMessage);
        currentHistory = [...currentHistory, newMessage];
      }

      updateActiveConversation(c => ({
        ...c,
        messages: [...c.messages, ...newMessages],
        prompt: "",
      }));

      const totalCost = newMessages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
      const totalTokens = newMessages.reduce((sum, msg) => sum + (msg.tokens?.total || 0), 0);
      setSuccess(`Generated ${newMessages.length} messages${totalCost > 0 ? ` ($${totalCost.toFixed(4)}, ${totalTokens.toLocaleString()} tokens)` : ''}`);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSendAllMessages = async () => {
    const conv = getActiveConversation();
    if (!conv) {
      setError("Please select a conversation");
      return;
    }

    if (conv.messages.length === 0) {
      setError("No messages to send");
      return;
    }

    setSendingEmail(true);
    setError(null);
    setSuccess(null);

    try {
      const allParticipants = [conv.selectedAccount, ...conv.otherAccounts].filter(Boolean) as Account[];
      let sentCount = 0;
      let cumulativeDelay = 0;

      // First, schedule all messages with their send times
      const messagesWithSchedule = conv.messages.map((message, i) => {
        if (i === 0) {
          // First message sends immediately
          return { ...message, scheduledSendTime: new Date() };
        }
        
        // Calculate random delay for this message
        const minDelayMs = conv.minDelayMinutes * 60 * 1000;
        const maxDelayMs = conv.maxDelayMinutes * 60 * 1000;
        const randomDelay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
        cumulativeDelay += randomDelay;
        
        return {
          ...message,
          scheduledSendTime: new Date(Date.now() + cumulativeDelay),
        };
      });

      // Update conversation with scheduled times
      updateActiveConversation(c => ({
        ...c,
        messages: messagesWithSchedule,
      }));

      // Now send messages according to schedule
      const skippedAccounts: string[] = [];
      let lastMessageId: string | undefined; // Track the last sent message's Message-ID for threading
      
      for (let i = 0; i < messagesWithSchedule.length; i++) {
        const message = messagesWithSchedule[i];
        const senderAccount = allParticipants.find(acc => acc.id === message.accountId);
        if (!senderAccount || !senderAccount.emailConfig) {
          if (!skippedAccounts.includes(message.accountName)) {
            skippedAccounts.push(message.accountName);
          }
          console.warn(`Skipping message from ${message.accountName} - no email config`);
          continue;
        }

        try {
          // Wait until scheduled time
          if (message.scheduledSendTime) {
            const waitTime = message.scheduledSendTime.getTime() - Date.now();
            if (waitTime > 0) {
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }

          // Recipients are all other participants (excluding the sender)
          const recipients = allParticipants.filter(acc => acc.id !== message.accountId);
          if (recipients.length === 0) {
            console.warn(`Skipping message - no recipients`);
            continue;
          }

          // Use conversation's unique subject for all messages in this conversation
          const subject = conv.emailSubject || `Conversation: ${conv.name}`;
          const result = await sendEmailInternal(message, senderAccount, recipients, subject, conv.id, lastMessageId);
          sentCount++;
          
          // Store the Message-ID for the next message to reference
          lastMessageId = result.messageId;
          
          // Mark message as sent and store the Message-ID
          updateActiveConversation(c => ({
            ...c,
            messages: c.messages.map(m => 
              m.id === message.id ? { ...m, sent: true, scheduledSendTime: undefined, emailMessageId: result.messageId } : m
            ),
          }));
        } catch (err) {
          console.error(`Failed to send message: ${err}`);
          // Mark as failed (remove scheduled time but don't mark as sent)
          updateActiveConversation(c => ({
            ...c,
            messages: c.messages.map(m => 
              m.id === message.id ? { ...m, scheduledSendTime: undefined } : m
            ),
          }));
          // Continue with next message (but don't update lastMessageId, so threading continues correctly)
        }
      }

      let successMessage = `Sent ${sentCount} out of ${conv.messages.length} messages`;
      if (skippedAccounts.length > 0) {
        successMessage += `. Skipped ${skippedAccounts.length} account(s) without email config: ${skippedAccounts.join(", ")}. Please configure email settings for these accounts.`;
      }
      setSuccess(successMessage);
    } catch (err: any) {
      setError(err.message || "Failed to send messages");
    } finally {
      setSendingEmail(false);
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

    setAccounts(accounts.map(acc => 
      acc.id === editAccountId
        ? {
            ...acc,
            name: editAccountName.trim(),
            email: editAccountEmail.trim(),
            personality: editAccountPersonality.trim() || undefined,
          }
        : acc
    ));

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

    const account = accounts.find(acc => acc.id === configAccountId);
    if (!account) return;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      setError("All SMTP fields are required");
      return;
    }

    const updatedAccounts = accounts.map(acc => {
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

  const syncToGoogleSheets = async (syncType: "accounts" | "conversations" | "all" = "all") => {
    setSyncingToSheets(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        action: syncType === "all" ? "sync-all" : syncType === "accounts" ? "sync-accounts" : "sync-conversations",
      };

      if (syncType === "accounts" || syncType === "all") {
        payload.accounts = accounts;
      }
      if (syncType === "conversations" || syncType === "all") {
        payload.conversations = conversations;
      }

      const response = await fetch(`${getApiUrl()}/api/google-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // If permission error and we have a stored ID, suggest creating a new one
        if (data.error?.includes("permission") && googleSheetsId && !forceNew) {
          throw new Error(`${data.error}\n\nTip: The stored spreadsheet may have been created by a different account. Try clicking "Create New Spreadsheet" to create one with the service account.`);
        }
        throw new Error(data.error || "Failed to sync to Google Sheets");
      }

      // Store the persistent spreadsheet ID
      const persistentSpreadsheetId = "1g58SNJO1b6o7v8IVq1UizeJZG1PaaP5oXtnrE06kVlQ";
      if (data.spreadsheetId && data.spreadsheetId === persistentSpreadsheetId) {
        setGoogleSheetsId(persistentSpreadsheetId);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY_GOOGLE_SHEETS_ID, persistentSpreadsheetId);
        }
      }

      setSuccess(data.message || "Synced to Google Sheets successfully");
    } catch (err: any) {
      setError(err.message || "Failed to sync to Google Sheets");
    } finally {
      setSyncingToSheets(false);
    }
  };

  const clearSpreadsheetId = () => {
    if (confirm("This will clear the stored spreadsheet ID. A new spreadsheet will be created on the next sync. Continue?")) {
      setGoogleSheetsId(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY_GOOGLE_SHEETS_ID);
      }
      setSuccess("Spreadsheet ID cleared. Next sync will create a new spreadsheet.");
    }
  };

  const handleDeleteAccount = (accountId: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      setAccounts(accounts.filter(acc => acc.id !== accountId));
      setSuccess("Account deleted");
    }
  };

  const toggleOtherAccount = (account: Account) => {
    updateActiveConversation(c => {
      const isSelected = c.otherAccounts.some(a => a.id === account.id);
      return {
        ...c,
        otherAccounts: isSelected
          ? c.otherAccounts.filter(a => a.id !== account.id)
          : [...c.otherAccounts, account],
      };
    });
  };

  const activeConv = getActiveConversation();

  return (
    <div className="min-h-screen bg-black p-8" style={{
      backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
      backgroundSize: '20px 20px'
    }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">Email System</h1>
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

        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "conversations" | "accounts" | "database")} className="mb-6">
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>

          {/* Conversations Tab */}
          <TabsContent value="conversations" className="mt-6">
            <div className="space-y-6">
              <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Conversations</CardTitle>
                    <CardDescription>Manage multiple conversations</CardDescription>
                  </div>
                  <button 
                    className="h-9 px-3 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => {
                      console.log("New Conversation button clicked - native button");
                      createNewConversation();
                    }} 
                    type="button"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Conversation
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {conversations.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">No conversations yet</p>
                    <Button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("Create First Conversation button clicked");
                        createNewConversation();
                      }}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create First Conversation
                    </Button>
                  </div>
                ) : (
                  <Tabs value={activeConversationId || undefined} onValueChange={setActiveConversationId}>
                    <TabsList className="flex flex-wrap gap-2 mb-4">
                      {conversations.map((conv) => (
                        <TabsTrigger key={conv.id} value={conv.id} className="flex items-center gap-1">
                          <span>{conv.name}</span>
                          <button
                            type="button"
                            className="ml-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Rename conversation button clicked");
                              openRenameDialog(conv);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="ml-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log("Close conversation button clicked");
                              const remaining = conversations.filter(c => c.id !== conv.id);
                              setConversations(remaining);
                              if (activeConversationId === conv.id) {
                                setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
                              }
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {conversations.map((conv) => (
                      <TabsContent key={conv.id} value={conv.id} className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Participants */}
                          <div className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-lg">Participants</CardTitle>
                                <CardDescription>Add or remove participants from this conversation</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="space-y-2">
                                  <Label>All Participants</Label>
                                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {accounts.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">No accounts available</p>
                                    ) : (
                                      accounts.map((account) => {
                                        const isParticipant = conv.selectedAccount?.id === account.id || 
                                                             conv.otherAccounts.some(a => a.id === account.id);
                                        return (
                                          <div key={account.id} className="flex items-center justify-between p-2 rounded border border-border">
                                            <span className="text-sm">{account.name}</span>
                                            {isParticipant ? (
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                type="button"
                                                onClick={() => {
                                                  if (conv.selectedAccount?.id === account.id) {
                                                    updateActiveConversation(c => ({ ...c, selectedAccount: null }));
                                                  } else {
                                                    toggleOtherAccount(account);
                                                  }
                                                }}
                                              >
                                                <X className="h-3 w-3" />
                                              </Button>
                                            ) : (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                type="button"
                                                onClick={() => {
                                                  if (!conv.selectedAccount) {
                                                    updateActiveConversation(c => ({ ...c, selectedAccount: account }));
                                                  } else {
                                                    toggleOtherAccount(account);
                                                  }
                                                }}
                                              >
                                                <Plus className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                                <div className="pt-2 border-t">
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label htmlFor={`minDelay-${conv.id}`}>Minimum Delay (minutes)</Label>
                                      <Input
                                        id={`minDelay-${conv.id}`}
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={conv.minDelayMinutes}
                                        onChange={(e) => {
                                          const min = parseFloat(e.target.value) || 0;
                                          updateActiveConversation(c => ({
                                            ...c,
                                            minDelayMinutes: min,
                                            // Ensure max is not less than min
                                            maxDelayMinutes: c.maxDelayMinutes < min ? min : c.maxDelayMinutes,
                                          }));
                                        }}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor={`maxDelay-${conv.id}`}>Maximum Delay (minutes)</Label>
                                      <Input
                                        id={`maxDelay-${conv.id}`}
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={conv.maxDelayMinutes}
                                        onChange={(e) => {
                                          const max = parseFloat(e.target.value) || 0;
                                          updateActiveConversation(c => ({
                                            ...c,
                                            maxDelayMinutes: max,
                                            // Ensure min is not greater than max
                                            minDelayMinutes: c.minDelayMinutes > max ? max : c.minDelayMinutes,
                                          }));
                                        }}
                                      />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Messages will be sent with a random delay between {conv.minDelayMinutes} and {conv.maxDelayMinutes} minutes
                                    </p>
                                  </div>
                                  <div className="space-y-2 mt-4">
                                    <Label htmlFor={`length-${conv.id}`}>Conversation Length (messages)</Label>
                                    <Input
                                      id={`length-${conv.id}`}
                                      type="number"
                                      min="2"
                                      value={conv.conversationLength}
                                      onChange={(e) => {
                                        updateActiveConversation(c => ({
                                          ...c,
                                          conversationLength: parseInt(e.target.value) || 2,
                                        }));
                                      }}
                                    />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Messages */}
                          <div className="lg:col-span-2">
                            <Card>
                              <CardHeader>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <CardTitle className="text-lg">Messages</CardTitle>
                                    {(() => {
                                      const totalCost = conv.messages.reduce((sum, msg) => sum + (msg.cost || 0), 0);
                                      const totalTokens = conv.messages.reduce((sum, msg) => sum + (msg.tokens?.total || 0), 0);
                                      if (totalCost > 0 || totalTokens > 0) {
                                        return (
                                          <span className="text-sm text-muted-foreground">
                                            Total: ${totalCost.toFixed(4)} ({totalTokens.toLocaleString()} tokens)
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                  {conv.messages.length > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (confirm("Are you sure you want to clear all messages in this conversation?")) {
                                          updateActiveConversation(c => ({
                                            ...c,
                                            messages: [],
                                          }));
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Clear
                                    </Button>
                                  )}
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-6">
                                <div className="space-y-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                                  {conv.messages.length === 0 ? (
                                    <p className="text-muted-foreground text-center py-8">
                                      No messages yet. Generate a message to start.
                                    </p>
                                  ) : (
                                    conv.messages.map((msg) => {
                                      const countdown = getCountdown(msg.scheduledSendTime);
                                      // Only consider scheduled if there's a valid future scheduled time
                                      const isScheduled = msg.scheduledSendTime && !msg.sent && countdown !== null;
                                      
                                      return (
                                        <div key={msg.id} className="border-l-4 border-primary pl-4 py-2">
                                          <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">{msg.accountName}</span>
                                              {msg.sent && (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                              )}
                                              {isScheduled && (
                                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                  <span>Sending in:</span>
                                                  <span>{countdown}</span>
                                                  <Clock className="h-3 w-3" />
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                              <span className="text-sm text-muted-foreground">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                              </span>
                                              {msg.cost !== undefined && msg.tokens && (
                                                <span className="text-xs text-muted-foreground">
                                                  ${msg.cost.toFixed(6)} ({msg.tokens.total} tokens)
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-foreground mb-2">{msg.content}</p>
                                          {conv.selectedAccount?.emailConfig && !msg.sent && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log("Send Email button clicked");
                                                handleSendEmail(msg);
                                              }}
                                              disabled={sendingEmail || conv.otherAccounts.length === 0 || isScheduled}
                                            >
                                              <Mail className="mr-2 h-4 w-4" />
                                              {sendingEmail ? "Sending..." : isScheduled ? "Scheduled" : "Send Email"}
                                            </Button>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>

                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label htmlFor={`prompt-${conv.id}`}>Context/Prompt (optional)</Label>
                                    <Textarea
                                      id={`prompt-${conv.id}`}
                                      placeholder="Add context or instructions for the conversation..."
                                      value={conv.prompt}
                                      onChange={(e) => {
                                        updateActiveConversation(c => ({ ...c, prompt: e.target.value }));
                                      }}
                                      rows={3}
                                    />
                                  </div>

                                  {error && (
                                    <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
                                      {error}
                                    </div>
                                  )}

                                  {success && (
                                    <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-md">
                                      {success}
                                    </div>
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Generate Message button clicked");
                                        handleGenerateMessage();
                                      }}
                                      disabled={loading || !conv.selectedAccount || conv.otherAccounts.length === 0}
                                      className="w-full"
                                      type="button"
                                    >
                                      {loading ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        "Generate Single Message"
                                      )}
                                    </Button>
                                    <Button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Generate Full Conversation button clicked");
                                        handleGenerateFullConversation();
                                      }}
                                      disabled={loading || !conv.selectedAccount || conv.otherAccounts.length === 0}
                                      variant="secondary"
                                      className="w-full"
                                      type="button"
                                    >
                                      {loading ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        "Generate Full Conversation"
                                      )}
                                    </Button>
                                  </div>
                                  {conv.messages.length > 0 && (
                                    <Button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log("Send All Messages button clicked");
                                        handleSendAllMessages();
                                      }}
                                      disabled={sendingEmail || conv.messages.length === 0}
                                      variant="default"
                                      className="w-full"
                                      type="button"
                                    >
                                      {sendingEmail ? (
                                        <>
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          Sending...
                                        </>
                                      ) : (
                                        <>
                                          <Mail className="mr-2 h-4 w-4" />
                                          Send All Messages ({conv.messages.length})
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="mt-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          </TabsContent>

          {/* Database Tab */}
          <TabsContent value="database" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Google Sheets Integration</CardTitle>
                <CardDescription>Sync your accounts and conversations to Google Sheets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => syncToGoogleSheets("all")}
                      disabled={syncingToSheets || (accounts.length === 0 && conversations.length === 0)}
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
                          Sync All to Google Sheets
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => syncToGoogleSheets("accounts")}
                      disabled={syncingToSheets || accounts.length === 0}
                      variant="outline"
                      type="button"
                    >
                      <Database className="mr-2 h-4 w-4" />
                      Sync Accounts Only
                    </Button>
                    <Button
                      onClick={() => syncToGoogleSheets("conversations")}
                      disabled={syncingToSheets || conversations.length === 0}
                      variant="outline"
                      type="button"
                    >
                      <Database className="mr-2 h-4 w-4" />
                      Sync Conversations Only
                    </Button>
                    <Button
                      onClick={() => syncToGoogleSheets("all", true)}
                      disabled={syncingToSheets || (accounts.length === 0 && conversations.length === 0)}
                      variant="secondary"
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Spreadsheet
                    </Button>
                  </div>
                  {googleSheetsId && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="text-sm">
                        <div className="font-medium">Spreadsheet ID:</div>
                        <div className="text-muted-foreground font-mono text-xs mt-1">{googleSheetsId}</div>
                      </div>
                      <Button
                        onClick={clearSpreadsheetId}
                        variant="ghost"
                        size="sm"
                        type="button"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-2">The spreadsheet will contain three sheets:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Accounts:</strong> All account information including email configuration</li>
                      <li><strong>Conversations:</strong> Conversation metadata and settings</li>
                      <li><strong>Messages:</strong> All messages with costs and token usage</li>
                    </ul>
                    <p className="mt-3 text-xs">
                      <strong>Note:</strong> If you get permission errors, make sure your service account has the "Editor" or "Owner" role in your Google Cloud project IAM settings. You can also click "Create New Spreadsheet" to force creation of a new spreadsheet.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
            <DialogDescription>
              Create a new account to participate in conversations.
            </DialogDescription>
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
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Dialog Add Account button clicked");
                handleAddAccount();
              }}
              type="button"
            >
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
                  // Auto-adjust secure setting based on port
                  const portNum = parseInt(port);
                  if (portNum === 587) {
                    setSmtpSecure(false); // Port 587 uses STARTTLS, not SSL
                  } else if (portNum === 465) {
                    setSmtpSecure(true); // Port 465 uses SSL
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Common ports: 587 (STARTTLS), 465 (SSL), 25 (STARTTLS)
              </p>
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
                      setSmtpSecure(false); // Port 587 always uses STARTTLS, not SSL
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
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Save Email Config button clicked");
                handleSaveEmailConfig();
              }}
              type="button"
            >
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
            <DialogDescription>
              Update the account details.
            </DialogDescription>
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
            <Button variant="outline" onClick={() => {
              setEditDialogOpen(false);
              setEditAccountId(null);
              setEditAccountName("");
              setEditAccountEmail("");
              setEditAccountPersonality("");
              setError(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Dialog Edit Account button clicked");
                handleEditAccount();
              }}
              type="button"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Conversation Name Dialog */}
      <Dialog open={newConversationDialogOpen} onOpenChange={setNewConversationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
            <DialogDescription>
              Enter a name for your new conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newConversationName">Conversation Name</Label>
              <Input
                id="newConversationName"
                placeholder="e.g., Project Discussion, Team Meeting"
                value={newConversationName}
                onChange={(e) => setNewConversationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateConversationWithName();
                  }
                }}
                autoFocus
              />
            </div>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewConversationDialogOpen(false);
              setNewConversationName("");
              setError(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConversationWithName();
              }}
              type="button"
            >
              Create Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Conversation Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>
              Enter a new name for this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="renameConversationName">Conversation Name</Label>
              <Input
                id="renameConversationName"
                placeholder="Enter conversation name"
                value={renameConversationName}
                onChange={(e) => setRenameConversationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRenameConversation();
                  }
                }}
                autoFocus
              />
            </div>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRenameDialogOpen(false);
              setRenameConversationId(null);
              setRenameConversationName("");
              setError(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRenameConversation();
              }}
              type="button"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
