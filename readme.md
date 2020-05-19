# 🚀 Insta-bot

<b>insta-bot is a Telegram bot which tracks instagram stats. It is fully written in Node.js and uses self-written Instagram API</b> 

Bot is able to track:

- 👩🏻‍💻Followers
- 👨🏻‍💻 Following
- 🙅🏻‍♂️ Not following back
- 🤷🏻‍♀️ You're not following back
- 👍🏻 New followers
- 👎🏻 Lost Followers
- 🧟‍♀️ Zombie followers (in dev.)
- 👸🏻 Top followers (in dev.)



## 💻 Installation
Download and install the latest version of [Node.js](https://nodejs.org/en/)

Clone this repo, install dependencies and create some files:
```bash
git clone https://github.com/belotserkovtsev/insta-bot.git
cd insta-bot
npm install
mkdir cookie
mkdir userdata
echo "{users:[]}" > botUsers.json
```

Add proxy and insert your bot token:

```js
const socksAgent = new SocksAgent({
    socksHost: "8.8.8.8",
    socksPort: "888",
    socksUsername: 'username', //on need
    socksPassword: 'password' //on need
});
```
```js
const bot = new Telegraf('token', {
    telegram: { agent: socksAgent }
});
```

Launch your application with <b>pm2</b> or <b>node</b>

```bash
node index.js
```

## 🔮 Usage

![](https://media.giphy.com/media/ju0nZzxTv4tHNgZInX/giphy.gif)

## 📱 Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.