'use strict';

/**
 * ============================================================
 *  Discord Voice AFK Bot
 *  - Joins and holds a voice channel 24/7
 *  - Express keep-alive endpoint for UptimeRobot pings
 *  - Auto-reconnect logic for VoiceConnectionStatus changes
 * ============================================================
 */

const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;MTQ0ODYxNTA2ODcyMjc5MDQ4MA.Go1lZa.4zKf8Qknc9nOcsYb8Azh2L7pQ3i6RzXLT9L7YE
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;1528189793131827240
const PORT = process.env.PORT || 3000;

if (!DISCORD_TOKEN || !VOICE_CHANNEL_ID) {
  console.error('[CONFIG ERROR] DISCORD_TOKEN and VOICE_CHANNEL_ID must be set as environment variables.');
  process.exit(1);
}

// ------------------------------------------------------------
// Global process safety nets
// ------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

// ------------------------------------------------------------
// Express keep-alive server
// ------------------------------------------------------------
const app = express();

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    bot: client?.user?.tag || 'starting...',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Keep-alive endpoint running on port ${PORT}`);
});

// ------------------------------------------------------------
// Discord Client
// ------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let currentConnection = null;

/**
 * Joins the configured voice channel and attaches connection
 * lifecycle handlers for resilient reconnection.
 */
async function connectToVoiceChannel() {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);

    if (!channel || !channel.isVoiceBased()) {
      console.error(`[VOICE ERROR] Channel ${VOICE_CHANNEL_ID} is not a valid voice channel.`);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    currentConnection = connection;
    attachConnectionHandlers(connection);

    console.log(`[VOICE] Joined voice channel: ${channel.name} (${channel.id})`);
  } catch (error) {
    console.error('[VOICE ERROR] Failed to join voice channel:', error);
    // Retry after a short delay if the initial join attempt fails
    setTimeout(connectToVoiceChannel, 10_000);
  }
}

/**
 * Attaches status-change listeners to a VoiceConnection instance
 * to handle disconnects and failures gracefully.
 */
function attachConnectionHandlers(connection) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn('[VOICE] Connection disconnected. Attempting to recover...');

    try {
      // Race between reconnecting (rejoin signal) and destroying (kicked/left)
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      console.log('[VOICE] Recovered from disconnect automatically.');
    } catch (error) {
      // Reconnection attempt failed within timeout window — do a clean rejoin
      console.warn('[VOICE] Auto-recovery failed. Destroying connection and scheduling clean reconnect.');
      safeDestroyConnection(connection);

      setTimeout(() => {
        connectToVoiceChannel();
      }, 5_000);
    }
  });

  connection.on(VoiceConnectionStatus.Failed, () => {
    console.error('[VOICE] Connection entered Failed state. Destroying and scheduling full re-join.');
    safeDestroyConnection(connection);

    setTimeout(() => {
      connectToVoiceChannel();
    }, 10_000);
  });

  connection.on('error', (error) => {
    console.error('[VOICE ERROR] Connection error event:', error);
  });
}

/**
 * Safely destroys a voice connection, guarding against
 * double-destroy errors if the connection is already gone.
 */
function safeDestroyConnection(connection) {
  try {
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  } catch (error) {
    console.error('[VOICE ERROR] Error while destroying connection:', error);
  } finally {
    currentConnection = null;
  }
}

// ------------------------------------------------------------
// Discord Client Event Handlers
// ------------------------------------------------------------
client.once('ready', async () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);
  await connectToVoiceChannel();
});

client.on('error', (error) => {
  console.error('[DISCORD CLIENT ERROR]', error);
});

client.on('shardError', (error) => {
  console.error('[DISCORD SHARD ERROR]', error);
});

// ------------------------------------------------------------
// Login
// ------------------------------------------------------------
client.login(DISCORD_TOKEN).catch((error) => {
  console.error('[LOGIN ERROR] Failed to authenticate with Discord:', error);
  process.exit(1);
});
