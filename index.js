const {
  Client,
  GatewayIntentBits,
  Routes,
  InteractionResponseType,
  MessageFlags,
} = require("discord.js");
require("dotenv").config();
const http = require("http");

const interactionMessages = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.on("ready", () => {
  console.log("Logged in as " + client.user.tag);
});

client.ws.on("INTERACTION_CREATE", async (interaction) => {
  if (interaction?.application_id !== process.env.APPLICATION_ID) return;
  console.log("Received interaction", interaction.id);

  const sendErrorMessage = (content) => {
    return client.rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content,
            flags: MessageFlags.Ephemeral,
          },
        },
        auth: false,
      }
    );
  };

  let forwardPath;
  let responseType;

  if (interaction.type === 2) {
    forwardPath = "/command";
    responseType = InteractionResponseType.DeferredChannelMessageWithSource;
  } else if (interaction.type === 3) {
    // Check for rate limit (3 seconds)
    const lastInteraction = interactionMessages.get(interaction.message.id);
    if (lastInteraction && Date.now() - lastInteraction < 3000) {
      await sendErrorMessage(
        "You just pressed that button! Please wait a few seconds."
      );
      console.log("Rate limited button interaction");
      return;
    }
    interactionMessages.set(interaction.message.id, Date.now());
    forwardPath = "/component";
    responseType = InteractionResponseType.DeferredMessageUpdate;
  } else {
    return;
  }

  await client.rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: responseType,
      },
      auth: false,
    }
  );

  const url = process.env.FORWARD_URL + forwardPath;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bot " + process.env.BOT_TOKEN,
    },
    body: JSON.stringify(interaction),
  });

  console.log(
    "Forwarded response status:",
    response.status,
    response.statusText
  );

  if (!response.ok) {
    try {
      await sendErrorMessage("Failed to process interaction");
    } catch (error) {
      if (!error.message.includes("acknowledged")) {
        console.error(error.message);
      }
    }
  }
});

const port = process.env.PORT || 3000;
http
  .createServer(function (req, res) {
    res.write("meow");
    res.end();
  })
  .listen(port, () => {
    console.log(`Server running on port ${port}`);
    client.login(process.env.BOT_TOKEN);
  });
