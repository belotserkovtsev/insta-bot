const Telegraf = require('telegraf');
const Stage = require('telegraf/stage')
const session = require('telegraf/session')
const BaseScene = require('telegraf/scenes/base')
const SocksAgent = require('socks5-https-client/lib/Agent');
var Parser = require('./parser.js');
const fs = require('fs');

/* proxy is needed to work with bot from Russia
free-socks: http://spys.one/en/socks-proxy-list/ */
const socksAgent = new SocksAgent({
  socksHost: "ip",
  socksPort: "port"
});

const bot = new Telegraf('token', {
    telegram: { agent: socksAgent }
});

/* New scene creation */
const nickname = new BaseScene('nickname');
const password = new BaseScene('password');
const menu = new BaseScene('menu');
const menuLoggedIn = new BaseScene('menuLoggedIn');


password.enter(ctx => {
    ctx.reply('Введи пароль!',
    Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra())
})

password.hears('💔Отменить', ctx => {
    if(ctx.session.isLoggedIn || (fs.existsSync('./userdata/' + ctx.message.from.username + '.json') && JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json')).loggedIn))
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
});

password.on('message', ctx => {
    if(ctx.message.text == '✅Да'){
        ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
        ctx.session.parser.login(ctx.session.userAccount, ctx.session.userPassword).then(res => {
            let jsData = JSON.parse(res['data'])
            if(jsData['authenticated']){
                let userData = {
                    igNickname : ctx.session.userAccount,
                    igId : jsData['userId'],
                    username : ctx.message.from.username,
                    loggedIn: true,
                    isFirstParse: true,
                    followers:[],
                    following: [],
                    idontFollowBack: [],
                    dontFollowMeBack: []
                }
                let data = JSON.stringify(userData, null, 2);
                fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', data);
                ctx.session.isLoggedIn = true;
                // ctx.session.telegramAccount = 
                ctx.session.userPassword = '';
                ctx.scene.enter('menuLoggedIn');
            }
            else if(jsData['user']){
                ctx.reply('Пароль введен неверно! Попробуй еще раз',
                Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
                ctx.session.userPassword = '';
            }
            else{
                ctx.session.userPassword = '';
                ctx.reply('Бот не может войти в аккаунт. Напиши @belotserkovtsev об этой ошибке!');
                ctx.scene.enter('menu');
            }
        }).catch(err => {
            console.log(err);
        })
    }
    else if(ctx.message.text == '❎Нет'){
        userAccount = '';
        ctx.reply('Давай еще разок',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
    else{
        ctx.session.userPassword = ctx.message.text;
        ctx.reply('Пароль "' + ctx.message.text + '". Все верно?', Telegraf.Markup
        .keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    }
})

password.leave(ctx => {})

nickname.enter(ctx => {
    ctx.reply('Введи свой ник в инстаграм. Например @belotserkovtsev', 
    Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
});
nickname.hears('💔Отменить', ctx => {
    if(ctx.session.isLoggedIn || (fs.existsSync('./userdata/' + ctx.message.from.username + '.json') && JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json')).loggedIn))
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
});
nickname.on('message', ctx => {
    if(ctx.message.text == '✅Да'){
        ctx.scene.enter('password');
    }
    else if(ctx.message.text == '❎Нет'){
        ctx.session.userAccount = '';
        ctx.reply('Давай еще разок',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
    else if(ctx.message.text.indexOf('@') == 0){
        ctx.session.userAccount = ctx.message.text.slice(1);
        ctx.reply('Ты хочешь устновить основным аккаунтом "' + ctx.message.text.slice(1) + '"?', Telegraf.Markup
        .keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    }
    else{
        ctx.reply('Неверный формат. Попробуй еще раз',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
})
nickname.on('error', err => console.log(err));
nickname.leave(ctx => {});

menu.enter(ctx => {
    ctx.reply('📱Главное меню. Не вошел',Telegraf.Markup.keyboard([['🔍Войти в аккаунт', '🧬О боте'], ['💣Сообщить о баге']]).oneTime().resize().extra());
});

menu.hears('💣Сообщить о баге', ctx => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
});

menu.hears('🔍Войти в аккаунт', Stage.enter('nickname'));

menu.hears('🧬О боте', ctx => {
    ctx.reply('Описание');
});

menu.on('message', ctx => {
    ctx.reply('Неизвестная команда. Воспользуйся меню')
});

menu.leave(ctx => {});

menuLoggedIn.enter(ctx => {
    ctx.reply('📱Главное меню. Вошел',Telegraf.Markup.keyboard([['📟Личный кабинет', '🧬Анализировать'], ['🔍Сменить аккаунт', '📄О боте'] ,['💣Сообщить о баге', '📵Забыть меня']]).oneTime().resize().extra());
})

menuLoggedIn.hears('📟Личный кабинет', ctx => {
    ctx.reply('В разработке')
});

menuLoggedIn.hears('🧬Анализировать', async (ctx) => {
    let jsonData;
    let existsFile = false;
    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        existsFile = true;
    }
    if(!ctx.session.isLoggedIn && existsFile && jsonData.loggedIn){
        ctx.session.isLoggedIn = true;
        ctx.session.userAccount = jsonData.igNickname;
    }
    if(!ctx.session.parser){
        ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
    }
    if(ctx.session.isLoggedIn){
        let followers, following, idontFollowBack, dontFollowMeBack;
        followers = jsonData.followers;
        following = jsonData.following;
        idontFollowBack = jsonData.idontFollowBack;
        dontFollowMeBack = jsonData.dontFollowMeBack;

        await ctx.session.parser.getFollowers(jsonData.igId).then(async (res) => {
            console.log(res);
            if(jsonData.isFirstParse)
                await ctx.reply('Анализ успешно завершен. Ниже представлена краткая статистическая сводка, но намного больше информации можно получить, если перейти в \n"📟Личный кабинет"')
            let newFollowersCount = res['newFollowers'].length - res['lostFollowers'].length;
            if(newFollowersCount > 0)
                await ctx.reply('+' + res['newFollowers'].length + ' подписчиков\n');
            else if(newFollowersCount < 0)
                await ctx.reply('-' + res['lostFollowers'].length + ' подписчиков');
            else
                await ctx.reply('Количество подписчиков не изменилось');
            if(!jsonData.isFirstParse)
                await ctx.reply('Чтобы получить более детальную статистику перейди в "📟Личный кабинет"')
            else{
                jsonData.isFirstParse = false;
                // let data = JSON.stringify(jsonData, null, 2);
                fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', JSON.stringify(jsonData, null, 2));
            }
        });


    }
    // ctx.reply('В разработке');
});

menuLoggedIn.hears('💣Сообщить о баге', ctx => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
});

menuLoggedIn.on('message', ctx => {
    ctx.reply('Неизвестная команда. Воспользуйся меню')
});

/* Registering scenes */
const stage = new Stage();
stage.register(nickname);
stage.register(password);
stage.register(menu);
stage.register(menuLoggedIn);

/* Making staging work, initializing session for personalized statistics */
bot.use(session())
bot.use(stage.middleware())

/* On /start event handler */
bot.start(ctx => {
    // ctx.reply('Привет, я бот-трекер статистики для инстаграм. Я умею:\nСчитать подписчиков\nНаходить тех, кто не подписан на вас', 
    // Telegraf.Markup.keyboard([['🔍Ввести свой ник', '🧬Анализировать'], ['💣Сообщить о баге']]).oneTime().resize().extra());
    if(ctx.session.isLoggedIn || (fs.existsSync('./userdata/' + ctx.message.from.username + '.json') && JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json')).loggedIn))
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
});



bot.launch();
