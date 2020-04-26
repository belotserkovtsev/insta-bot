const Telegraf = require('telegraf');
const Stage = require('telegraf/stage')
const session = require('telegraf/session')
const BaseScene = require('telegraf/scenes/base')
const SocksAgent = require('socks5-https-client/lib/Agent');
const fs = require('fs');

//proxy is needed to work with bot from Russia
//free-socks: http://spys.one/en/socks-proxy-list/
const socksAgent = new SocksAgent({
  socksHost: "***",
  socksPort: "1080"
});

var userAccount;

/* const testMenu = Telegraf.Extra
  .markdown()
  .markup((m) => m.inlineKeyboard([
    m.callbackButton('Test button', 'test')
  ])) */

const bot = new Telegraf('token', {
    telegram: { agent: socksAgent }
});

//On /start event handler
bot.start(ctx => {
    ctx.reply('Привет, я бот-трекер статистики для инстаграм. Я умею:\nСчитать подписчиков\nНаходить тех, кто не подписан на вас', 
    Telegraf.Markup.keyboard([['🔍Ввести свой ник', '🧬Анализировать'], ['💣Сообщить о баге']]).oneTime().resize().extra());
});


//New scene creation
const nickname = new BaseScene('nickname');

nickname.enter(ctx => {
    ctx.reply('Введи свой ник в инстаграм. Например @belotserkovtsev', 
    Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
});
nickname.hears('💔Отменить', ctx => {
    ctx.scene.leave();
});
nickname.on('message', ctx => {
    if(ctx.message.text == '✅Да'){
        let userData = {
            igNickname : userAccount,
            username : ctx.message.from.username
        }
        let data = JSON.stringify(userData, null, 2);
        fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', data);
        ctx.scene.leave();
    }
    else if(ctx.message.text == '❎Нет'){
        userAccount = '';
        ctx.reply('Давай еще разок',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
    else if(ctx.message.text.indexOf('@') == 0){
        userAccount = ctx.message.text.slice(1);
        ctx.reply('Ты хочешь устновить основным аккаунтом "' + ctx.message.text.slice(1) + '"?', Telegraf.Markup
        .keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    }
    else{
        ctx.reply('Неверный формат. Попробуй еще раз',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
})
nickname.leave(ctx => {
    ctx.reply('Готово!', 
    Telegraf.Markup.keyboard([['🔍Ввести свой ник', '🧬Анализировать'], ['💣Сообщить о баге']]).oneTime().resize().extra());
})

//Registering scenes
const stage = new Stage();
stage.register(nickname)

//Making staging work
bot.use(session())
bot.use(stage.middleware())

//Choosing scene
bot.hears('🔍Ввести свой ник', Stage.enter('nickname'));
bot.hears('🧬Анализировать', ctx => {
    ctx.reply('В разработке')
})
bot.hears('💣Сообщить о баге', ctx => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
})



bot.launch();
