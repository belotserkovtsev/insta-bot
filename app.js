const Telegraf = require('telegraf');
const Stage = require('telegraf/stage')
const session = require('telegraf/session')
const BaseScene = require('telegraf/scenes/base')

const bot = new Telegraf(process.env.TOKEN);

//On /start event handler
bot.start(ctx => {
    ctx.reply('Привет, я бот-трекер статистики для инстаграм. Я умею:\nСчитать подписчиков\nНаходить тех, кто не подписан на вас', 
    Telegraf.Markup.keyboard([['🔍Ввести свой ник', '🧬Анализировать'], ['💣Сообщить о баге']]).oneTime().resize().extra());
});


//New scene creation
const nickname = new BaseScene('nickname');

nickname.enter(ctx => {
    ctx.reply('Введи свой ник в инстаграм. Например @belotserkovtsev');
});

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
