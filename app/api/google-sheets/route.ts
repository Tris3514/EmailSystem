import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Get shared auth instance
const getAuth = () => {
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
  if (!credentials) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS environment variable is not set");
  }

  let parsedCredentials;
  try {
    parsedCredentials = JSON.parse(credentials);
  } catch (parseError) {
    throw new Error(`Failed to parse GOOGLE_SHEETS_CREDENTIALS: ${parseError}. Make sure it's valid JSON.`);
  }

  if (!parsedCredentials.client_email || !parsedCredentials.private_key) {
    throw new Error("GOOGLE_SHEETS_CREDENTIALS is missing required fields (client_email or private_key)");
  }

  return new google.auth.GoogleAuth({
    credentials: parsedCredentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file", // Needed to create files
    ],
  });
};

// Initialize Google Sheets client
const getSheetsClient = () => {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
};

// Initialize Google Drive client (needed to create spreadsheets)
const getDriveClient = () => {
  const auth = getAuth();
  return google.drive({ version: "v3", auth });
};

// Get or create spreadsheet
async function getOrCreateSpreadsheet(sheets: any, drive: any, spreadsheetId?: string) {
  if (spreadsheetId) {
    try {
      // Try to access the existing spreadsheet
      const existingSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      console.log("Successfully accessed existing spreadsheet:", spreadsheetId);
      return spreadsheetId;
    } catch (error: any) {
      console.error("Error accessing existing spreadsheet:", error.message);
      // If we can't access it, we'll create a new one below
      console.log("Cannot access existing spreadsheet, will create a new one");
    }
  }

  // Create new spreadsheet using Drive API (required for service accounts)
  // This will only be called if no spreadsheetId is provided or if we can't access the existing one
  try {
    console.log("Creating new persistent spreadsheet using Drive API...");
    
    // Create spreadsheet file using Drive API
    const fileMetadata = {
      name: "Email System Database",
      mimeType: "application/vnd.google-apps.spreadsheet",
    };

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });

    const newSpreadsheetId = driveResponse.data.id!;
    console.log("Successfully created new spreadsheet via Drive API:", newSpreadsheetId);

    // Now add the sheets using Sheets API
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: newSpreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: "Accounts" },
            },
          },
          {
            addSheet: {
              properties: { title: "Conversations" },
            },
          },
          {
            addSheet: {
              properties: { title: "Messages" },
            },
          },
        ],
      },
    });

    // Delete the default "Sheet1" if it exists
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: newSpreadsheetId });
      const defaultSheet = spreadsheet.data.sheets?.find((s: any) => s.properties.title === "Sheet1");
      if (defaultSheet) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: newSpreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId: defaultSheet.properties.sheetId,
                },
              },
            ],
          },
        });
      }
    } catch (e) {
      // Ignore errors when deleting default sheet
      console.log("Could not delete default sheet (this is okay)");
    }

    console.log("Successfully set up spreadsheet with sheets");
    return newSpreadsheetId;
  } catch (error: any) {
    console.error("Error creating spreadsheet:", error);
    throw new Error(`Failed to create spreadsheet: ${error.message}. Make sure:\n1. Google Drive API is enabled in your Google Cloud project\n2. Google Sheets API is enabled\n3. The service account has proper permissions`);
  }
}

// Initialize sheet headers
async function initializeSheet(sheets: any, spreadsheetId: string, sheetName: string, headers: string[]) {
  try {
    // Check if sheet exists and has headers
    const range = `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    if (response.data.values && response.data.values.length > 0) {
      // Headers already exist
      return;
    }
  } catch (error) {
    // Sheet might not exist or be empty
  }

  // Set headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [headers],
    },
  });
}

// Sync accounts to Google Sheets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, spreadsheetId, accounts, conversations } = body;

    if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
      return NextResponse.json(
        { error: "Google Sheets credentials not configured. Please set GOOGLE_SHEETS_CREDENTIALS environment variable." },
        { status: 500 }
      );
    }

    let sheets;
    try {
      sheets = getSheetsClient();
      console.log("Google Sheets client initialized successfully");
    } catch (authError: any) {
      console.error("Authentication error:", authError);
      return NextResponse.json(
        { error: `Authentication failed: ${authError.message}. Please check your GOOGLE_SHEETS_CREDENTIALS.` },
        { status: 500 }
      );
    }

    const drive = getDriveClient();
    
    let currentSpreadsheetId;
    try {
      currentSpreadsheetId = await getOrCreateSpreadsheet(sheets, drive, spreadsheetId);
      console.log("Using spreadsheet ID:", currentSpreadsheetId);
    } catch (spreadsheetError: any) {
      console.error("Spreadsheet error:", spreadsheetError);
      const errorMsg = spreadsheetError.message || "Unknown error";
      
      // Provide more specific error messages
      if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("permission")) {
        return NextResponse.json(
          { 
            error: `Permission denied: ${errorMsg}\n\nTroubleshooting steps:\n1. Make sure Google Sheets API is enabled\n2. Check that your service account has 'Editor' or 'Owner' role in IAM\n3. If using an existing spreadsheet ID, make sure it was created by the service account or share it with: tris-249@email-system-database.iam.gserviceaccount.com\n4. Try creating a new spreadsheet by not providing a spreadsheetId` 
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to access spreadsheet: ${errorMsg}. Make sure the Google Sheets API is enabled in your Google Cloud project.` },
        { status: 500 }
      );
    }

    if (action === "sync-accounts" && accounts) {
      // Initialize Accounts sheet
      await initializeSheet(sheets, currentSpreadsheetId, "Accounts", [
        "ID",
        "Name",
        "Email",
        "Personality",
        "SMTP Host",
        "SMTP Port",
        "SMTP User",
        "Email Configured",
        "Last Updated",
      ]);

      // Clear existing data (except headers)
      await sheets.spreadsheets.values.clear({
        spreadsheetId: currentSpreadsheetId,
        range: "Accounts!A2:Z1000",
      });

      // Prepare account data
      const accountRows = accounts.map((acc: any) => [
        acc.id || "",
        acc.name || "",
        acc.email || "",
        acc.personality || "",
        acc.emailConfig?.smtpHost || "",
        acc.emailConfig?.smtpPort?.toString() || "",
        acc.emailConfig?.smtpUser || "",
        acc.emailConfig ? "Yes" : "No",
        new Date().toISOString(),
      ]);

      // Add account data
      if (accountRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: currentSpreadsheetId,
          range: "Accounts!A2",
          valueInputOption: "RAW",
          requestBody: {
            values: accountRows,
          },
        });
      }

      return NextResponse.json({
        success: true,
        spreadsheetId: currentSpreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}`,
        message: `Synced ${accounts.length} account(s) to Google Sheets`,
      });
    }

    if (action === "sync-conversations" && conversations) {
      // Initialize Conversations sheet
      await initializeSheet(sheets, currentSpreadsheetId, "Conversations", [
        "Conversation ID",
        "Name",
        "Selected Account",
        "Other Accounts",
        "Message Count",
        "Email Subject",
        "Min Delay (min)",
        "Max Delay (min)",
        "Conversation Length",
        "Created",
        "Last Updated",
      ]);

      // Initialize Messages sheet
      await initializeSheet(sheets, currentSpreadsheetId, "Messages", [
        "Message ID",
        "Conversation ID",
        "Conversation Name",
        "Account ID",
        "Account Name",
        "Account Email",
        "Content",
        "Timestamp",
        "Sent",
        "Email Message ID",
        "Cost (USD)",
        "Tokens (Input)",
        "Tokens (Output)",
        "Tokens (Total)",
      ]);

      // Clear existing data
      await sheets.spreadsheets.values.clear({
        spreadsheetId: currentSpreadsheetId,
        range: "Conversations!A2:Z1000",
      });
      await sheets.spreadsheets.values.clear({
        spreadsheetId: currentSpreadsheetId,
        range: "Messages!A2:Z1000",
      });

      // Prepare conversation data
      const conversationRows: any[] = [];
      const messageRows: any[] = [];

      conversations.forEach((conv: any) => {
        conversationRows.push([
          conv.id || "",
          conv.name || "",
          conv.selectedAccount?.name || conv.selectedAccount?.email || "",
          conv.otherAccounts?.map((a: any) => a.name || a.email).join(", ") || "",
          conv.messages?.length || 0,
          conv.emailSubject || "",
          conv.minDelayMinutes || "",
          conv.maxDelayMinutes || "",
          conv.conversationLength || "",
          new Date().toISOString(),
          new Date().toISOString(),
        ]);

        // Add messages
        if (conv.messages && Array.isArray(conv.messages)) {
          conv.messages.forEach((msg: any) => {
            messageRows.push([
              msg.id || "",
              conv.id || "",
              conv.name || "",
              msg.accountId || "",
              msg.accountName || "",
              msg.accountEmail || "",
              msg.content || "",
              msg.timestamp ? new Date(msg.timestamp).toISOString() : "",
              msg.sent ? "Yes" : "No",
              msg.emailMessageId || "",
              msg.cost || "",
              msg.tokens?.input || "",
              msg.tokens?.output || "",
              msg.tokens?.total || "",
            ]);
          });
        }
      });

      // Add conversation data
      if (conversationRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: currentSpreadsheetId,
          range: "Conversations!A2",
          valueInputOption: "RAW",
          requestBody: {
            values: conversationRows,
          },
        });
      }

      // Add message data
      if (messageRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: currentSpreadsheetId,
          range: "Messages!A2",
          valueInputOption: "RAW",
          requestBody: {
            values: messageRows,
          },
        });
      }

      return NextResponse.json({
        success: true,
        spreadsheetId: currentSpreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}`,
        message: `Synced ${conversations.length} conversation(s) and ${messageRows.length} message(s) to Google Sheets`,
      });
    }

    if (action === "sync-all") {
      // Sync both accounts and conversations
      const accountsResult = accounts
        ? await POST(
            new NextRequest(request.url, {
              method: "POST",
              body: JSON.stringify({ action: "sync-accounts", spreadsheetId: currentSpreadsheetId, accounts }),
            })
          )
        : null;

      const conversationsResult = conversations
        ? await POST(
            new NextRequest(request.url, {
              method: "POST",
              body: JSON.stringify({
                action: "sync-conversations",
                spreadsheetId: currentSpreadsheetId,
                conversations,
              }),
            })
          )
        : null;

      return NextResponse.json({
        success: true,
        spreadsheetId: currentSpreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${currentSpreadsheetId}`,
        accounts: accountsResult ? await accountsResult.json() : null,
        conversations: conversationsResult ? await conversationsResult.json() : null,
        message: "Synced all data to Google Sheets",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Google Sheets sync error:", error);
    
    // Provide more detailed error messages
    let errorMessage = error.message || "Failed to sync to Google Sheets";
    
    if (error.message?.includes("PERMISSION_DENIED") || error.message?.includes("permission")) {
      errorMessage = `Permission denied: ${error.message}. Make sure:\n1. Google Sheets API is enabled in your Google Cloud project\n2. The service account JSON credentials are correct\n3. The service account has the necessary permissions`;
    } else if (error.message?.includes("not found") || error.message?.includes("NOT_FOUND")) {
      errorMessage = `Spreadsheet not found: ${error.message}. The spreadsheet may have been deleted or the ID is incorrect.`;
    } else if (error.message?.includes("UNAUTHENTICATED") || error.message?.includes("authentication")) {
      errorMessage = `Authentication failed: ${error.message}. Please check your GOOGLE_SHEETS_CREDENTIALS environment variable.`;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

