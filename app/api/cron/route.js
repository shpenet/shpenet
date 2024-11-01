import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@/app/_lib/mongo/models/connection";
import { connectToDatabase } from "@/app/_lib/mongo/connection/connection";
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Function to send reminder email using SendGrid
async function sendReminderEmail(connection) {
  // Conditionally add notes section only if notes exist and are not an empty string
  const notesSection = connection.notes ? `<li><strong>Notes:</strong> ${connection.notes}</li>` : '';

  const msg = {
    from: "shpenehelpdesk@outlook.com", // Your verified sender
    to: connection.email,
    subject: `Reminder: Connection with ${connection.firstName} ${connection.lastName}`,
    html: `
      <h2>Connection Reminder</h2>
      <p>Hello! This is a reminder about your connection with:</p>
      <ul>
        <li><strong>Name:</strong> ${connection.firstName} ${connection.lastName}</li>
        <li><strong>LinkedinURL:</strong> <a href="${connection.linkedinUrl}">${connection.linkedinUrl}</a></li>
        <li><strong>Position:</strong> ${connection.position}</li>
        <li><strong>Company:</strong> ${connection.companyName}</li>
        <li><strong>Company URL:</strong> <a href="${connection.companyURL}">${connection.companyURL}</a></li>
        ${notesSection}
      </ul>
      <p>Best regards,<br>Your Networking Assistant</p>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`Reminder email sent to ${connection.email}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    console.error('SendGrid error details:', error.response?.body);
    return false;
  }
}
// Process reminders function
async function processReminders() {
  try {
    // Find all documents where remindTime is in the past and reminded is false
    const connectionsToRemind = await Connection.find({
      remindTime: { $lte: new Date() },
      reminded: false
    });

    console.log(`Found ${connectionsToRemind.length} connections to remind`);

    // Process each connection
    for (const connection of connectionsToRemind) {
      try {
        // Send email
        const emailSent = await sendReminderEmail(connection);
        
        if (emailSent) {
          // Update reminded status
          await Connection.findByIdAndUpdate(connection._id, {
            reminded: true,
            remindTime: null
          });
          
          console.log(`Successfully processed reminder for ${connection.email} with ID: ${connection._id}`);
        }
      } catch (error) {
        console.error(`Error processing reminder for ${connection.email}:`, error);
        continue;
      }
    }

  } catch (error) {
    console.error('Error in processReminders:', error);
    throw error;
  }
}

export async function GET(request) {
  // Verify the cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    // Connect to MongoDB
    await connectToDatabase();

    console.log("Cron Job Started at:", new Date());
    
    // Process reminders
    await processReminders();
    
    console.log("Cron Job Completed at:", new Date());

    // Return detailed results
    return NextResponse.json({
      message: "Cron Job Completed",
      timestamp: new Date()
    });

  } catch (error) {
    console.error("Cron Job Error:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error.message
      },
      { status: 500 }
    );
  }
}