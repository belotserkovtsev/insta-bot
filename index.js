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
const lk = new BaseScene('lk');
const tfa = new BaseScene('tfa');

tfa.enter(ctx => {
    let keyboard = ['Резервные коды']
    if(ctx.session.sms)
        keyboard.push('SMS');
    
    ctx.reply('У тебя настроена двухфакторная аутентификация. Введи 6-значный код, сгенерированный твоим приложением для аутентификации или выбери другой способ',
    Telegraf.Markup.keyboard([keyboard]).oneTime().resize().extra());
})

tfa.hears('SMS', ctx => {
    ctx.session.parser.tfa('SMS', ctx.session.identifier).then(res => {
        if(res){
            let jsonData = JSON.parse(res['data']);
            ctx.reply(`На твой телефон, оканчивающийся на ${jsonData['two_factor_info']['obfuscated_phone_number']}, было отправлено смс с кодом. Напиши его сюда`);
            ctx.session.identifier = jsonData['two_factor_info']['two_factor_identifier'];
        }
        else{
            ctx.reply('Ошибка с отправкой кода. Попробуй еще раз');
        }
    });
});

// tfa.hears('Резервные коды', ctx => {

// });

tfa.on('message', ctx => {
    ctx.session.parser.tfa('auth', ctx.session.identifier, ctx.message.text).then(res => {
        if(res){
            let jsData = JSON.parse(res['data']);
            console.log(jsData);
            
            let userData = {
                igNickname : ctx.session.userAccount,
                igId : jsData['userId'],
                username : ctx.message.from.username,
                timeupdate: Date.now(),
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
            // ctx.session.userPassword = '';
            ctx.scene.enter('menuLoggedIn');
        }
            
        else
            ctx.reply('Не успешно')
    })
})

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
        ctx.session.parser.login(ctx.session.userAccount, ctx.session.userPassword).then(async (res) => {
            let jsData = JSON.parse(res['data'])
            if(jsData['two_factor_required']){
                ctx.session.identifier = jsData['two_factor_info']['two_factor_identifier'];
                ctx.session.sms = jsData['two_factor_info']['sms_two_factor_on'];
                ctx.scene.enter('tfa');
                // ctx.session.totp = jsData['two_factor_info']['totp_two_factor_on']
            }
            else if(jsData['authenticated']){
                let userData = {
                    igNickname : ctx.session.userAccount,
                    igId : jsData['userId'],
                    username : ctx.message.from.username,
                    timeupdate: Date.now(),
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

menuLoggedIn.hears('📟Личный кабинет', Stage.enter('lk'));

menuLoggedIn.hears('🧬Анализировать', async (ctx) => {
    await ctx.reply('В процессе...');
    let jsonData;
    if(ctx.session.isLoggedIn){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        let followers, following, idontFollowBack, dontFollowMeBack, newFollowersCount;
        followers = jsonData.followers;
        following = jsonData.following;
        idontFollowBack = jsonData.idontFollowBack;
        dontFollowMeBack = jsonData.dontFollowMeBack;

        await ctx.session.parser.getFollowers(jsonData.igId).then(async (res) => {
            newFollowersCount = res['newFollowers'].length - res['lostFollowers'].length;

            if(newFollowersCount > 0)
                await ctx.reply('Подписчики => ' + res['followers'].length + '(+' + newFollowersCount + ')');
            else if(newFollowersCount < 0)
                await ctx.reply('Подписчики => ' + res['followers'].length + '(' + newFollowersCount + ')');
            else
                await ctx.reply('Подписчики => ' + res['followers'].length);
            await ctx.reply('Я не подписан в ответ => ' + res['idontFollowBack'].length);

            
        })
        .catch(err => console.log(err));

        await ctx.session.parser.getFollowing(jsonData.igId).then(async (res) => {
            console.log(res)
            let dfmbCount = jsonData.dontFollowMeBack.length - res['dontFollowMeBack'].length
            await ctx.reply('Подписки => ' + res['following'].length)

            if(dfmbCount > 0)
                await ctx.reply('На меня не подписаны в ответ => ' + res['dontFollowMeBack'].length + ' (-' +  Math.abs(dfmbCount) + ')');
            else if(dfmbCount < 0)
                await ctx.reply('На меня не подписаны в ответ => ' + res['dontFollowMeBack'].length + ' (+' + Math.abs(dfmbCount) + ')');
            else   
                await ctx.reply('На меня не подписаны в ответ => ' + res['dontFollowMeBack'].length);
            
            if(!jsonData.isFirstParse)
                await ctx.reply('Чтобы получить более детальную статистику перейди \nв "📟Личный кабинет"');
            else{
                jsonData.isFirstParse = false;
                await ctx.reply('Первый анализ успешно завершен. При следующем анализе ниже будет представлена краткая статистическая сводка, но намного больше информации можно получить, если перейти \nв "📟Личный кабинет"');
                fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', JSON.stringify(jsonData, null, 2));
            }
        })
        .catch(err => console.log(err));
    }
    // ctx.reply('В разработке');
});

menuLoggedIn.hears('💣Сообщить о баге', ctx => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
});

menuLoggedIn.on('message', ctx => {
    ctx.reply('Неизвестная команда. Воспользуйся меню')
});

lk.enter(ctx => {
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
    ctx.reply(`📱Инстаграм: ${ctx.session.userAccount}\n👩🏻‍💻Подписчиков: ${jsonData.followers.length}\n👨🏻‍💻Подписок: ${jsonData.following.length}`
    ,Telegraf.Markup.keyboard([['Новые подписчики', 'Потерянные подписчики'], ['Я не подписан в ответ', 'На меня не подписаны в ответ'] ,['Главное меню']]).oneTime().resize().extra());
});

lk.hears('Главное меню', ctx => {
    ctx.scene.enter('menuLoggedIn');
});

/* Registering scenes */
const stage = new Stage();
stage.register(nickname);
stage.register(password);
stage.register(menu);
stage.register(menuLoggedIn);
stage.register(lk);
stage.register(tfa);

/* Making staging work, initializing session for personalized statistics */
bot.use(session())
bot.use(stage.middleware())

/* On /start event handler */
bot.start(ctx => {
    if(ctx.session.isLoggedIn || (fs.existsSync('./userdata/' + ctx.message.from.username + '.json') && JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json')).loggedIn))
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
});

bot.on('message', async (ctx) => {
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
    await ctx.reply('Бот был перезагружен. Твоя сессия восстановлена');
    if(ctx.session.isLoggedIn)
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
})



bot.launch();
// let test = new Parser('JuliaMills8971282', 'belotserkovtsev');
// test.getFollowing('33765647560');
// test.getFollowers('33765647560')
