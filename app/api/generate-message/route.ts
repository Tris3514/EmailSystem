import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client - Vercel will provide the API key at runtime
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const isVercel = process.env.VERCEL === '1';
    const errorMessage = isVercel
      ? "OPENAI_API_KEY is not set. Please add it in Vercel project settings: Settings → Environment Variables → Add OPENAI_API_KEY"
      : "OPENAI_API_KEY is not set. For local development, create a .env.local file with: OPENAI_API_KEY=your_key_here";
    throw new Error(errorMessage);
  }
  return new OpenAI({
    apiKey: apiKey,
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

    // Extract token usage
    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;

    // Calculate cost (gpt-4o-mini pricing as of 2024)
    // Input: $0.15 per million tokens, Output: $0.60 per million tokens
    const INPUT_COST_PER_MILLION = 0.15;
    const OUTPUT_COST_PER_MILLION = 0.60;

    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION;
    const totalCost = inputCost + outputCost;

    console.log(`Token usage: ${inputTokens} input + ${outputTokens} output = ${totalTokens} total`);
    console.log(`Estimated cost: $${totalCost.toFixed(6)}`);

    return NextResponse.json({ 
      message: messageContent,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cost: totalCost,
      }
    });
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

