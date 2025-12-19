import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// The persistent spreadsheet ID
const SPREADSHEET_ID = "1g58SNJO1b6o7v8IVq1UizeJZG1PaaP5oXtnrE06kVlQ";

// Initialize Google Sheets client
const getSheetsClient = () => {
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

  const auth = new google.auth.GoogleAuth({
    credentials: parsedCredentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
};

// Verify access to the spreadsheet
async function verifySpreadsheetAccess(sheets: any) {
  try {
    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    console.log("Successfully accessed spreadsheet:", SPREADSHEET_ID);
    return SPREADSHEET_ID;
  } catch (error: any) {
    console.error("Error accessing spreadsheet:", error.message);
    throw new Error(`Cannot access spreadsheet: ${error.message}. Make sure:\n1. The spreadsheet is shared with: tris-249@email-system-database.iam.gserviceaccount.com\n2. Google Sheets API is enabled\n3. The service account has Editor access to the spreadsheet`);
  }
}

// Get or create a sheet by name
async function getOrCreateSheet(sheets: any, spreadsheetId: string, sheetName: string) {
  try {
    // Get all sheets in the spreadsheet
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheet = spreadsheet.data.sheets?.find(
      (sheet: any) => sheet.properties.title === sheetName
    );

    if (existingSheet) {
      console.log(`Sheet "${sheetName}" already exists`);
      return existingSheet.properties.sheetId;
    }

    // Create the sheet if it doesn't exist
    console.log(`Creating sheet "${sheetName}"...`);
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    });

    const newSheetId = addSheetResponse.data.replies[0].addSheet?.properties.sheetId;
    console.log(`Successfully created sheet "${sheetName}" with ID: ${newSheetId}`);
    return newSheetId;
  } catch (error: any) {
    console.error(`Error getting/creating sheet "${sheetName}":`, error.message);
    throw error;
  }
}

// Initialize sheet headers
async function initializeSheet(sheets: any, spreadsheetId: string, sheetName: string, headers: string[]) {
  try {
    // Make sure the sheet exists
    await getOrCreateSheet(sheets, spreadsheetId, sheetName);

    // Check if headers already exist
    const range = `${sheetName}!A1:${String.fromCharCode(64 + headers.length)}1`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    if (response.data.values && response.data.values.length > 0) {
      console.log(`Headers already exist for sheet "${sheetName}"`);
      return;
    }
  } catch (error: any) {
    // If get fails, sheet might not exist - we'll create it below
    if (!error.message?.includes("not found")) {
      console.error(`Error checking sheet "${sheetName}":`, error.message);
    }
  }

  // Set headers
  try {
    console.log(`Setting headers for sheet "${sheetName}"...`);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [headers],
      },
    });
    console.log(`Successfully set headers for sheet "${sheetName}"`);
  } catch (error: any) {
    console.error(`Error setting headers for sheet "${sheetName}":`, error.message);
    throw error;
  }
}

// Sync accounts to Google Sheets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accounts, conversations } = body;

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

    // Verify access to the persistent spreadsheet
    let currentSpreadsheetId;
    try {
      currentSpreadsheetId = await verifySpreadsheetAccess(sheets);
      console.log("Using persistent spreadsheet ID:", currentSpreadsheetId);
    } catch (spreadsheetError: any) {
      console.error("Spreadsheet error:", spreadsheetError);
      const errorMsg = spreadsheetError.message || "Unknown error";
      
      return NextResponse.json(
        { error: errorMsg },
        { status: 500 }
      );
    }

    if (action === "sync-accounts" && accounts) {
      console.log(`Starting sync-accounts with ${accounts.length} accounts`);
      
      // Initialize Accounts sheet
      try {
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
        console.log("Accounts sheet initialized");
      } catch (initError: any) {
        console.error("Error initializing Accounts sheet:", initError);
        throw new Error(`Failed to initialize Accounts sheet: ${initError.message}`);
      }

      // Clear existing data (except headers)
      try {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: currentSpreadsheetId,
          range: "Accounts!A2:Z1000",
        });
        console.log("Cleared existing account data");
      } catch (clearError: any) {
        console.error("Error clearing account data:", clearError);
        // Continue anyway - might be empty already
      }

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

      console.log(`Prepared ${accountRows.length} account rows:`, accountRows);

      // Add account data
      if (accountRows.length > 0) {
        try {
          console.log(`Writing ${accountRows.length} account rows to sheet "Accounts"...`);
          const updateResponse = await sheets.spreadsheets.values.update({
            spreadsheetId: currentSpreadsheetId,
            range: "Accounts!A2",
            valueInputOption: "RAW",
            requestBody: {
              values: accountRows,
            },
          });
          console.log(`Successfully wrote ${accountRows.length} account rows. Updated cells:`, updateResponse.data.updatedCells);
        } catch (writeError: any) {
          console.error("Error writing account data:", writeError);
          throw new Error(`Failed to write account data: ${writeError.message}`);
        }
      } else {
        console.log("No account rows to write");
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
        try {
          console.log(`Writing ${conversationRows.length} conversation rows to sheet "Conversations"...`);
          const convUpdateResponse = await sheets.spreadsheets.values.update({
            spreadsheetId: currentSpreadsheetId,
            range: "Conversations!A2",
            valueInputOption: "RAW",
            requestBody: {
              values: conversationRows,
            },
          });
          console.log(`Successfully wrote ${conversationRows.length} conversation rows. Updated cells:`, convUpdateResponse.data.updatedCells);
        } catch (writeError: any) {
          console.error("Error writing conversation data:", writeError);
          throw new Error(`Failed to write conversation data: ${writeError.message}`);
        }
      } else {
        console.log("No conversation rows to write");
      }

      // Add message data
      if (messageRows.length > 0) {
        try {
          console.log(`Writing ${messageRows.length} message rows to sheet "Messages"...`);
          const msgUpdateResponse = await sheets.spreadsheets.values.update({
            spreadsheetId: currentSpreadsheetId,
            range: "Messages!A2",
            valueInputOption: "RAW",
            requestBody: {
              values: messageRows,
            },
          });
          console.log(`Successfully wrote ${messageRows.length} message rows. Updated cells:`, msgUpdateResponse.data.updatedCells);
        } catch (writeError: any) {
          console.error("Error writing message data:", writeError);
          throw new Error(`Failed to write message data: ${writeError.message}`);
        }
      } else {
        console.log("No message rows to write");
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
              body: JSON.stringify({ action: "sync-accounts", accounts }),
            })
          )
        : null;

      const conversationsResult = conversations
        ? await POST(
            new NextRequest(request.url, {
              method: "POST",
              body: JSON.stringify({
                action: "sync-conversations",
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

    if (action === "load-data") {
      // Load data from Google Sheets
      try {
        console.log("Loading data from Google Sheets...");
        
        // Load accounts
        let accountsData: any[] = [];
        try {
          const accountsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: currentSpreadsheetId,
            range: "Accounts!A2:I1000",
          });
          if (accountsResponse.data.values) {
            accountsData = accountsResponse.data.values.map((row: any[]) => ({
              id: row[0] || "",
              name: row[1] || "",
              email: row[2] || "",
              personality: row[3] || undefined,
              emailConfig: row[4] ? {
                smtpHost: row[4] || "",
                smtpPort: parseInt(row[5]) || 587,
                smtpUser: row[6] || "",
                smtpPassword: "", // Don't store password in sheets
                smtpSecure: false,
              } : undefined,
            }));
          }
          console.log(`Loaded ${accountsData.length} accounts from sheet`);
        } catch (e: any) {
          console.error("Error loading accounts:", e.message);
        }

        // Load conversations (simplified - just metadata)
        let conversationsData: any[] = [];
        try {
          const convResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: currentSpreadsheetId,
            range: "Conversations!A2:K1000",
          });
          if (convResponse.data.values) {
            conversationsData = convResponse.data.values.map((row: any[]) => ({
              id: row[0] || "",
              name: row[1] || "",
              emailSubject: row[5] || "",
              minDelayMinutes: parseFloat(row[6]) || 1,
              maxDelayMinutes: parseFloat(row[7]) || 5,
              conversationLength: parseInt(row[8]) || 6,
              selectedAccount: null,
              otherAccounts: [],
              messages: [],
              prompt: "",
            }));
          }
          console.log(`Loaded ${conversationsData.length} conversations from sheet`);
        } catch (e: any) {
          console.error("Error loading conversations:", e.message);
        }

        return NextResponse.json({
          success: true,
          accounts: accountsData,
          conversations: conversationsData,
          message: `Loaded ${accountsData.length} account(s) and ${conversationsData.length} conversation(s) from Google Sheets`,
        });
      } catch (error: any) {
        console.error("Error loading data:", error);
        return NextResponse.json(
          { error: `Failed to load data: ${error.message}` },
          { status: 500 }
        );
      }
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

