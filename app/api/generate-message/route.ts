import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client lazily to avoid build-time errors
const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables. Please add it to .env.local");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
};

interface Message {
  id: string;
  accountId: string;
  accountName: string;
  accountEmail: string;
  content: string;
  timestamp: Date;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, otherAccounts, conversationHistory, prompt } = body;

    // Validate required fields
    if (!account || !account.name || !account.email) {
      return NextResponse.json(
        { error: "Invalid account data. Name and email are required." },
        { status: 400 }
      );
    }

    if (!otherAccounts || !Array.isArray(otherAccounts) || otherAccounts.length === 0) {
      return NextResponse.json(
        { error: "At least one other account is required for conversation." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set in environment variables. Please add it to .env.local" },
        { status: 500 }
      );
    }

    // Build conversation context
    const systemPrompt = `You are ${account.name} (${account.email}). ${
      account.personality
        ? `Your personality and communication style: ${account.personality}.`
        : "You are professional and friendly."
    }

You are participating in an email conversation with: ${otherAccounts
      .map((acc: any) => `${acc.name} (${acc.email})`)
      .join(", ")}.

${prompt ? `Conversation context: ${prompt}` : ""}

Generate a natural email message that fits the conversation. Keep it concise (2-4 sentences typically). Respond as ${account.name} would, maintaining consistency with your personality.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history (handle undefined/null)
    const history = Array.isArray(conversationHistory) ? conversationHistory : [];
    history.forEach((msg: any) => {
      if (!msg || !msg.content) return; // Skip invalid messages
      
      if (msg.accountId === account.id) {
        messages.push({ role: "assistant", content: msg.content });
      } else {
        messages.push({
          role: "user",
          content: `From ${msg.accountName || "Unknown"} (${msg.accountEmail || "unknown"}): ${msg.content}`,
        });
      }
    });

    // If this is the first message, add a starter message
    if (history.length === 0) {
      messages.push({
        role: "user",
        content: `Start the conversation. ${prompt || "Introduce yourself and begin discussing the topic."}`,
      });
    } else {
      // Continue the conversation naturally
      messages.push({
        role: "user",
        content: "Continue the conversation naturally based on the context above.",
      });
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.8,
      max_tokens: 200,
    });

    console.log("OpenAI API Response:", JSON.stringify(completion, null, 2));
    
    const messageContent = completion.choices[0]?.message?.content;
    
    if (!messageContent || messageContent.trim() === "") {
      console.error("Empty or missing message content from API:", completion);
      return NextResponse.json(
        { error: "The API returned an empty message. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: messageContent });
  } catch (error: any) {
    console.error("Error generating message:", error);
    
    // Handle OpenAI API errors specifically
    if (error.status === 429 || error.message?.includes("quota") || error.message?.includes("rate limit")) {
      return NextResponse.json(
        { error: "OpenAI API quota exceeded. Please add credits to your OpenAI account at https://platform.openai.com/account/billing" },
        { status: 429 }
      );
    }
    
    if (error.response) {
      const errorMessage = error.response.data?.error?.message || error.message;
      if (errorMessage?.includes("quota") || errorMessage?.includes("rate limit")) {
        return NextResponse.json(
          { error: "OpenAI API quota exceeded. Please add credits to your OpenAI account at https://platform.openai.com/account/billing" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `OpenAI API error: ${error.response.status} - ${errorMessage || error.response.statusText}` },
        { status: error.response.status || 500 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to generate message. Please check your OpenAI API key and try again." },
      { status: 500 }
    );
  }
}

