import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import dns from "dns";

interface EmailAccount {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure?: boolean;
}

export async function POST(request: NextRequest) {
  let accountConfig: EmailAccount | undefined;
  try {
    const body = await request.json();
    const { from, to, subject, text, html, accountConfig: config, conversationId } = body;
    accountConfig = config;

    // Validate required fields
    if (!from || !to || !subject || (!text && !html)) {
      return NextResponse.json(
        { error: "Missing required fields: from, to, subject, and text/html are required." },
        { status: 400 }
      );
    }

    if (!accountConfig) {
      return NextResponse.json(
        { error: "Email account configuration is required." },
        { status: 400 }
      );
    }

    const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecure } = accountConfig;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      return NextResponse.json(
        { error: "SMTP configuration is incomplete. Host, port, user, and password are required." },
        { status: 400 }
      );
    }

    // Verify DNS resolution before attempting connection
    try {
      await new Promise<void>((resolve, reject) => {
        // Use IPv4 explicitly to avoid IPv6 issues
        dns.lookup(smtpHost.trim(), { family: 4 }, (err, address) => {
          if (err) {
            // Try without family restriction as fallback
            dns.lookup(smtpHost.trim(), (err2, address2) => {
              if (err2) {
                reject(new Error(`DNS resolution failed for "${smtpHost}": ${err2.message}. Please check your internet connection and DNS settings.`));
              } else {
                console.log(`DNS resolved ${smtpHost} to ${address2}`);
                resolve();
              }
            });
          } else {
            console.log(`DNS resolved ${smtpHost} to ${address}`);
            resolve();
          }
        });
      });
    } catch (dnsError: any) {
      return NextResponse.json(
        { error: dnsError.message || `Failed to resolve SMTP host "${smtpHost}". Please check your internet connection.` },
        { status: 503 }
      );
    }

    // Create transporter
    // Port 465 uses SSL/TLS from the start (secure: true) - direct SSL connection
    // Port 587 uses STARTTLS (secure: false) - plain connection upgraded to TLS
    // Port 25 is usually plain text (no encryption)
    const isSecurePort = smtpPort === 465;
    const isStartTLSPort = smtpPort === 587 || smtpPort === 25;
    
    // For port 587, NEVER use secure: true (it causes SSL version mismatch)
    // For port 465, ALWAYS use secure: true
    // For other ports, use the user's preference or default to false
    let useSecure = false;
    if (isSecurePort) {
      useSecure = true; // Port 465 always uses SSL
    } else if (isStartTLSPort) {
      useSecure = false; // Port 587/25 always uses STARTTLS (never secure: true)
    } else {
      useSecure = smtpSecure ?? false; // For other ports, use user preference
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost.trim(),
      port: smtpPort,
      secure: useSecure, // false for STARTTLS ports, true for SSL ports
      requireTLS: isStartTLSPort, // Require TLS upgrade for STARTTLS ports
      auth: {
        user: smtpUser.trim(),
        pass: smtpPassword,
      },
      connectionTimeout: 10000, // 10 seconds timeout
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates (optional, for testing)
      },
      debug: false, // Set to true for detailed logging
    });

    // Verify connection
    await transporter.verify();

    // Send email
    const info = await transporter.sendMail({
      from: `"${from.split('@')[0]}" <${accountConfig.email || smtpUser}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html: html || text,
    });

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: "Email sent successfully",
    });
  } catch (error: any) {
    console.error("Error sending email:", error);
    
    if (error.code === "EAUTH") {
      return NextResponse.json(
        { error: "Authentication failed. Please check your email credentials." },
        { status: 401 }
      );
    }
    
    if (error.code === "ECONNECTION" || error.code === "ETIMEDOUT") {
      return NextResponse.json(
        { error: "Connection failed. Please check your SMTP settings and network connection." },
        { status: 503 }
      );
    }

    if (error.code === "ENOTFOUND" || error.message?.includes("getaddrinfo ENOTFOUND")) {
      const host = accountConfig?.smtpHost || "SMTP host";
      return NextResponse.json(
        { 
          error: `DNS resolution failed for "${host}". Please check:\n1. Your internet connection\n2. The SMTP host address is correct\n3. Your firewall/DNS settings\n\nCommon SMTP hosts:\n- Gmail: smtp.gmail.com\n- Outlook: smtp-mail.outlook.com\n- Yahoo: smtp.mail.yahoo.com` 
        },
        { status: 503 }
      );
    }

    if (error.code === "ETIMEDOUT") {
      return NextResponse.json(
        { error: "Connection timeout. Please check your SMTP host and port settings." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to send email. Please check your configuration." },
      { status: 500 }
    );
  }
}

