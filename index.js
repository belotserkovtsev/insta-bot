const Telegraf = require('telegraf');
const Stage = require('telegraf/stage')
const session = require('telegraf/session')
const BaseScene = require('telegraf/scenes/base')
const SocksAgent = require('socks5-https-client/lib/Agent');
const Parser = require('./parser.js');
const fs = require('fs');

/* proxy is needed to work with bot from Russia
free-socks: http://spys.one/en/socks-proxy-list/ */
const socksAgent = new SocksAgent({
  
});

const bot = new Telegraf('', {
    telegram: { agent: socksAgent }
});

/* New scene creation */
const nickname = new BaseScene('nickname');
const password = new BaseScene('password');
const menu = new BaseScene('menu');
const menuLoggedIn = new BaseScene('menuLoggedIn');
const lk = new BaseScene('lk');
const tfa = new BaseScene('tfa');
const newAcc = new BaseScene('newAcc');
const forgetMe = new BaseScene('forgetMe');

tfa.enter(ctx => {
    let keyboard = [['🔑Резервные коды']];
    if(ctx.session.totp){
        if(ctx.session.sms)
            keyboard[0].push('📬SMS');
        keyboard.push(['💔Отмена'])
        ctx.replyWithHTML('📡<b>У тебя настроена двухфакторная аутентификация</b>. Введи 6-значный код, сгенерированный твоим приложением для аутентификации или выбери другой способ',
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
    else if(ctx.session.sms){
        keyboard.push(['💔Отмена'])
        ctx.replyWithHTML(`📡<b>У тебя настроена двухфакторная аутентификация</b>. На твой телефон, оканчивающийся на ${ctx.session.phone}, было отправлено смс с кодом. Введи его сюда или выбери другой способ`,
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
})

tfa.hears('📬SMS', ctx => {
    ctx.session.parser.tfa('SMS', ctx.session.identifier).then(res => {
        if(res){
            let jsonData = JSON.parse(res['data']);
            ctx.replyWithHTML(`📡<b>На твой телефон, оканчивающийся на ${jsonData['two_factor_info']['obfuscated_phone_number']}, было отправлено смс с кодом</b>. Напиши его сюда`);
            ctx.session.identifier = jsonData['two_factor_info']['two_factor_identifier'];
        }
        else{
            ctx.replyWithHTML('❎<b>Ошибка с отправкой кода</b>. Попробуй еще раз');
        }
    });
});

/* tfa.hears('Резервные коды', ctx => {
    
}); */

tfa.hears('💔Отмена', ctx => {
    ctx.replyWithHTML('❎<b>Операция отменена</b>. Твои данные стерты')
    .then(res => {
        ctx.scene.enter('menu');
    })
    delete ctx.session.identifier;
    delete ctx.session.sms;
    delete ctx.session.totp;
    delete ctx.session.userAccount;
    delete ctx.session.parser;
    delete ctx.session.phone;
    fs.unlink('./cookie/' + ctx.message.from.username, res => {});
});

tfa.on('message', ctx => {
    console.log(ctx.session.identifier);
    ctx.session.parser.tfa('auth', ctx.session.identifier, ctx.message.text).then(res => {
        if(res['authenticated']){
            let jsData = res;
            let userData = {
                igNickname : ctx.session.userAccount,
                igId : jsData['userId'],
                username : ctx.message.from.username,
                rights: 0,
                timeupdate: null,
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
            delete ctx.session.identifier;
            delete ctx.session.sms;
            delete ctx.session.totp;
            delete ctx.session.phone;
            ctx.scene.enter('menuLoggedIn');
        }

        else if(res['error_type'] == "sms_code_validation_code_invalid"){
            ctx.replyWithHTML('❎<b>Код введен неверно</b>. Попробуй еще раз, выбери другой способ или отмени операцию');
            // ctx.session.isLoggedIn = true;
            
        }

        else if(res['error_type'] == 'invalid_nonce'){
            ctx.replyWithHTML('❎<b>Код истек</b>. Попробуй еще раз, выбери другой способ или отмени операцию');
        }
            
        else{
            ctx.replyWithHTML('❎<b>Случилась неизвестная ошибка</b>. Напиши @belotserkovtsev, если думаешь что это баг')
            .then(res => {
                ctx.scene.enter('menu');
            })
            delete ctx.session.identifier;
            delete ctx.session.sms;
            delete ctx.session.totp;
            delete ctx.session.userAccount;
            delete ctx.session.parser;
            delete ctx.session.phone;
            fs.unlink('./cookie/' + ctx.message.from.username, res => {});
        }
        
        
        
        
    })
})

password.enter(ctx => {
    ctx.replyWithHTML('🔐Введи пароль от инстаграм. Бот <b>не хранит</b> и <b>не передает</b> твой пароль третьим лицам',
    Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra())
})

password.hears('💔Отменить', ctx => {
    delete ctx.session.parser;
    if(fs.existsSync('./cookie/' + ctx.message.from.username))
        fs.unlink('./cookie/' + ctx.message.from.username, res => {});
    delete ctx.session.userAccount;
    ctx.scene.enter('menu');
    /* if(ctx.session.isLoggedIn || (fs.existsSync('./userdata/' + ctx.message.from.username + '.json') && JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json')).loggedIn))
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu'); */
});

password.on('message', ctx => {
    if(ctx.message.text == '✅Да'){
        // ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
        ctx.session.parser.login(ctx.session.userAccount, ctx.session.userPassword).then(async (res) => {
            let jsData = JSON.parse(res['data'])
            if(jsData['two_factor_required']){
                ctx.session.identifier = jsData['two_factor_info']['two_factor_identifier'];
                ctx.session.sms = jsData['two_factor_info']['sms_two_factor_on'];
                ctx.session.totp = jsData['two_factor_info']['totp_two_factor_on'];
                ctx.session.phone = jsData['two_factor_info']['obfuscated_phone_number'];
                delete ctx.session.userPassword;
                ctx.scene.enter('tfa');
            }
            else if(jsData['authenticated']){
                let userData = {
                    igNickname : ctx.session.userAccount,
                    igId : jsData['userId'],
                    username : ctx.message.from.username,
                    rights: 0,
                    timeupdate: null,
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
                delete ctx.session.userPassword;
                ctx.scene.enter('menuLoggedIn');
            }
            else if(jsData['user']){
                ctx.replyWithHTML('🔒<b>Пароль введен неверно</b>! Попробуй еще раз',
                Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
                delete ctx.session.userPassword;
            }
            else{
                delete ctx.session.userPassword;
                delete ctx.session.parser;
                ctx.replyWithHTML('❎<b>Бот не может войти в аккаунт. Введенного логина не существует или произошла внутрення ошибка</b>. Напиши @belotserkovtsev если считаешь что это баг');
                if(fs.existsSync('./cookie/' + ctx.message.from.username))
                    fs.unlink('./cookie/' + ctx.message.from.username, res => {});
                delete ctx.session.userAccount;
                ctx.scene.enter('menu');
            }
        }).catch(err => {
            console.log(err);
        })
    }
    else if(ctx.message.text == '❎Нет'){
        delete ctx.session.userPassword;
        ctx.reply('Давай еще разок',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
    else{
        ctx.session.userPassword = ctx.message.text;
        ctx.replyWithHTML('🔓<b>Пароль введен верно?</b>', Telegraf.Markup
        .keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    }
})

nickname.enter(ctx => {
    ctx.replyWithHTML('👽<b>Введи свой ник в инстаграм</b>. Например @belotserkovtsev', 
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
        ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
        ctx.scene.enter('password');
    }
    else if(ctx.message.text == '❎Нет'){
        delete ctx.session.userAccount;
        ctx.replyWithHTML('🔁<b>Попробуй еще раз</b>',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
    else if(ctx.message.text.indexOf('@') == 0){
        ctx.session.userAccount = ctx.message.text.slice(1);
        ctx.replyWithHTML('👨🏻‍💻Ты хочешь устновить основным аккаунтом "<b>' + ctx.message.text.slice(1) + '</b>"?', Telegraf.Markup
        .keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    }
    else{
        ctx.replyWithHTML('❎<b>Неверный формат</b>. Попробуй еще раз',
        Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
    }
})
nickname.on('error', err => console.log(err));
nickname.leave(ctx => {});

menu.enter(ctx => {
    ctx.reply('📱Главное меню',Telegraf.Markup.keyboard([['🔍Войти в аккаунт', '🧬Соглашение'], ['💣Сообщить о баге', '🧭О боте']]).oneTime().resize().extra());
});

menu.hears('💣Сообщить о баге', ctx => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
});

menu.hears('🔍Войти в аккаунт', Stage.enter('nickname'));

menu.hears('🧭О боте', ctx => {
    ctx.replyWithHTML(`🚀 Бот анализирует твою страницу в Инстаграм и показывает статистическую сводку по следующим пунктам: 🚀

<b>Подписки,
Подписчики,
Потерянные подписчики,
Новые подписчики,
На меня не подписаны в ответ,
Я не подписан в ответ,
Топ подписчиков,
Зомби-подписчики</b>`)
});

menu.hears('🧬Соглашение', ctx => {
    ctx.replyWithHTML(`Для корректной работы и анализа страницы потребуется единоразово ввести логин и пароль от Инстаграм, после чего он будет навсегда удален из памяти сервера.

Могу заверить, что пароли <b>не передаются</b> третьим лицам, <b>не записываются</b> и <b>не хранятся</b> на сервере ни в каком виде. Для того, чтобы анализировать страницу, бот записывает сессионные куки в файл и кладет его на сервер. В любой момент ты сможешь нажать кнопку 📵<b>Забыть меня</b> и сессионные куки будут удалены.
    
<b>Продолжая использование, ты соглашаешься передать сессионные куки боту (и на обработку персональных данных, таких как подписки, подписчики, лайки, отметки «сохранить»)</b>
    
Этот бот полностью open source, так что ты можешь <a href="https://github.com/belotserkovtsev/insta-bot">изучать его код</a>, следить за версиями или клонировать этот репозиторий для личного некоммерческого использования. Будем считать что это мои terms of service 😁`);
});

menu.on('message', ctx => {
    ctx.reply('Неизвестная команда. Воспользуйся меню')
});

menu.leave(ctx => {});

menuLoggedIn.enter(ctx => {
    ctx.replyWithHTML('📱<b>Главное меню</b>',Telegraf.Markup.keyboard([['📟Личный кабинет', '🧬Анализировать'], ['🔍Сменить аккаунт', '🧭О боте'] ,['💣Сообщить о баге', '📵Забыть меня']]).oneTime().resize().extra());
})

menuLoggedIn.hears('📟Личный кабинет', Stage.enter('lk'));

menuLoggedIn.hears('🧬Анализировать', async (ctx) => {
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
    if(ctx.session.isLoggedIn && (jsonData.isFirstParse || jsonData.rights > 0 || (jsonData.rights == 0 && jsonData.timeupdate/1000 <= (Date.now()/1000)-86400))){
        await ctx.reply('🔮 Запускаю анализатор...');
        // let following, idontFollowBack, dontFollowMeBack;
        
        // following = jsonData.following;
        // idontFollowBack = jsonData.idontFollowBack;
        // dontFollowMeBack = jsonData.dontFollowMeBack;

        let outputString = '\n🚀 <b>Статистическая сводка</b> 🚀\n\n'
        let outputStringEnd = '';

        await ctx.session.parser.getFollowers(jsonData.igId).then(async (res) => {
            let followers = res['followers'];
            let newFollowers = res['newFollowers'].length;
            let lostFollowers = res['lostFollowers'].length;
            let newFollowersCount, idontFollowBackCount;

            if(!jsonData.isFirstParse){
                newFollowersCount = res['newFollowers'].length - res['lostFollowers'].length;
                idontFollowBackCount = res['idontFollowBack'].length - jsonData.idontFollowBack.length;
            }
            else{
                newFollowersCount = 0;
                idontFollowBackCount = 0;
                newFollowers = 0;
                lostFollowers = 0;
            }
            

            outputString += newFollowersCount >= 0 ? `👩🏼‍💻 Подписчики: ${followers.length} (<b>+${newFollowersCount}</b>)\n\n` : `👩🏼‍💻 Подписчики: ${followers.length} (<b>${newFollowersCount}</b>)\n\n`;
            outputString += idontFollowBackCount >= 0 ? `🙅🏻‍♂️ Я не подписан в ответ: ${res['idontFollowBack'].length} (<b>+${idontFollowBackCount}</b>)\n\n` : `🙅🏻‍♂️ Я не подписан в ответ: ${res['idontFollowBack'].length} (<b>${idontFollowBackCount}</b>)\n\n`;
            outputStringEnd += `👍🏻 Новых подписчиков: <b>${newFollowers}</b>\n\n👎🏻 От меня отписались: <b>${lostFollowers}</b>\n`
        })
        .catch(err => console.log(err));

        await ctx.session.parser.getFollowing(jsonData.igId).then(async (res) => {
            // console.log(res)
            let dfmbCount, followingCount;

            if(!jsonData.isFirstParse){
                dfmbCount = res['dontFollowMeBack'].length - jsonData.dontFollowMeBack.length;
                followingCount = res['following'].length - jsonData.following.length;
            }
            else{
                dfmbCount = 0;
                followingCount = 0;
            }

            outputString += followingCount >= 0 ? `👨🏻‍💻 Подписки: ${res['following'].length} (<b>+${followingCount}</b>)\n\n` : `👨🏻‍💻 Подписки: ${res['following'].length} (<b>${followingCount}</b>)\n\n`;
            outputString += dfmbCount >= 0 ? `🧟‍♀️ На меня не подписаны в ответ: ${res['dontFollowMeBack'].length} (<b>+${dfmbCount}</b>)\n\n` : `🧟‍♀️ На меня не подписаны в ответ: ${res['dontFollowMeBack'].length} (<b>${dfmbCount}</b>)\n\n`;

            

            if(jsonData.isFirstParse){
                jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
                jsonData.isFirstParse = false;
                jsonData.timeupdate = Date.now();
                jsonData.monthlyTimeupdate = Date.now();
                jsonData.newFollowers = [];
                jsonData.monthlyFollowers = jsonData.followers.length;
                jsonData.monthlyFollowing = jsonData.following.length;
                await ctx.replyWithHTML('🔮<b>Первый анализ успешно завершен</b>. Ниже представлена краткая статистическая сводка, показывающая базовые изменения статистики, но намного больше информации можно получить, если перейти \nв "📟Личный кабинет"');
                fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', JSON.stringify(jsonData, null, 2));
            }
            else{
                jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
                if(((jsonData.monthlyTimeupdate/1000) + (86400*30)) <= Date.now()){
                    jsonData.monthlyTimeupdate = Date.now();
                    jsonData.monthlyFollowers = jsonData.followers.length;
                    jsonData.monthlyFollowing = jsonData.following.length;
                }
                jsonData.timeupdate = Date.now();
                fs.writeFileSync('./userdata/' + ctx.message.from.username + '.json', JSON.stringify(jsonData, null, 2));
            }
        })
        .catch(err => console.log(err));
        outputString += outputStringEnd;
        await ctx.replyWithHTML(outputString);
    }
    else{
        if(ctx.session.isLoggedIn){
            let secondsLeft = Math.floor((jsonData.timeupdate/1000)+86400-(Date.now()/1000));
            let hours = Math.floor((secondsLeft/60)/60);
            let minutes = Math.floor((secondsLeft/60) - hours * 60);
            ctx.replyWithHTML(`🧬<b>Следующий анализ будет доступен через ${hours}ч., ${minutes}мин.</b>`);
        }
    }
});

menuLoggedIn.hears('💣Сообщить о баге', ctx => {
    ctx.replyWithHTML('<b>Напиши мне что случилось</b>: \n@belotserkovtsev')
});

menuLoggedIn.hears('🧭О боте', ctx => {
    ctx.replyWithHTML(`🧭Бот анализирует твою страницу в Инстаграм и показывает статистическую сводку по следующим пунктам:

<b>Подписки,
Подписчики,
Потерянные подписчики,
Новые подписчики,
На меня не подписаны в ответ,
Я не подписан в ответ,
Топ подписчиков,
Зомби-подписчики</b>`)
});

// menuLoggedIn.('msg', ctx => {
//     let jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
//     if(jsonData.rights == 2){
//         jsonData = JSON.parse(fs.readFileSync('./botUsers.json'));
//         jsonData.users.forEach(i => {
//             bot.telegram.sendMessage(i.userId, 'hey');
//         })
//     }
//     else{
//         ctx.reply('У тебя нет прав высылать сообщения пользовтелям бота');
//     }
// });

menuLoggedIn.hears('🔍Сменить аккаунт', ctx => {
    ctx.scene.enter('newAcc').then(res => {
        ctx.reply('Все твои данные вместе со статистикой будут стерты. Продолжить?', Telegraf.Markup.keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    });
});

menuLoggedIn.hears('📵Забыть меня', ctx => {
    ctx.scene.enter('forgetMe').then(res => {
        ctx.reply('Все твои данные вместе со статистикой будут стерты. Продолжить?', Telegraf.Markup.keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    });
});

menuLoggedIn.on('message', ctx => {
    if(ctx.message.text.indexOf('#?') == 0){
        let jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        if(jsonData.rights == 2){
            jsonData = JSON.parse(fs.readFileSync('./botUsers.json'));
            jsonData.users.forEach(i => {
                bot.telegram.sendMessage(i.userId, ctx.message.text.slice(2));
            })
        }
        else{
            ctx.reply('У тебя нет прав высылать сообщения пользовтелям бота');
        }
    }
    else
        ctx.reply('Неизвестная команда. Воспользуйся меню')
});

lk.enter(ctx => {
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
    if(jsonData.isFirstParse){
        ctx.replyWithHTML('📟<b>Личный кабинет станет доступен после первого анализа</b>. Здесь ты сможешь найти более подробную статистику, посмотреть подписчиков и многое другое. <b>Возвращаю тебя в главное меню</b>')
        .then(res => ctx.scene.enter('menuLoggedIn'));
    }
    else{
        let followersGain = 100 - Math.round((jsonData.monthlyFollowers / jsonData.followers.length)*100);
        let followingGain = 100 - Math.round((jsonData.monthlyFollowing / jsonData.following.length)*100);
        let signFollowersGain, signFollowingGain;
        followersGain >= 0 ? signFollowersGain = '+' : signFollowersGain = '';
        followingGain >= 0 ? signFollowingGain = '+' : signFollowingGain = '';

        ctx.replyWithHTML(`📱 Инстаграм: ${ctx.session.userAccount}\n\n👩🏻‍💻 <b>Подписчиков: ${jsonData.followers.length}</b>\n⚡️${signFollowersGain}${followersGain}% за последний месяц\n\n👨🏻‍💻 <b>Подписок: ${jsonData.following.length}</b>\n⚡️${signFollowingGain}${followingGain}% за последний месяц`
        ,Telegraf.Markup.keyboard([['📱Главное меню'], ['👱🏻‍♀️Новые подписчики', '🤦🏼‍♀️Потерянные подписчики'], ['👨🏻‍💻Я не подписан в ответ', '🙅🏻На меня не подписаны в ответ'], ['🧟‍♀️Подписчики-зомби', '👸🏼Топ подписчиков']]).oneTime().resize().extra());
    }
    
});

lk.hears('📱Главное меню', ctx => {
    ctx.scene.enter('menuLoggedIn');
});

lk.hears('🙅🏻На меня не подписаны в ответ', ctx => {
    let keyboard = [['📲Назад']];
    let jsonData;
    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        for(let i = 0; i < jsonData.dontFollowMeBack.length - 1; i+=2){
            keyboard.push([ `@${jsonData.dontFollowMeBack[i]['username']}`, `@${jsonData.dontFollowMeBack[i+1]['username']}` ]);
        }
        if(jsonData.dontFollowMeBack.length % 2 != 0){
            keyboard.push([ `@${jsonData.dontFollowMeBack[jsonData.dontFollowMeBack.length-1]['username']}` ])
        }
        ctx.replyWithHTML(`🙅🏻<b>На меня не подписано в ответ ${jsonData.dontFollowMeBack.length} ч.</b>`, 
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
    else{

    }
});

lk.hears('👨🏻‍💻Я не подписан в ответ', ctx => {
    let keyboard = [['📲Назад']];
    let jsonData;
    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        for(let i = 0; i < jsonData.idontFollowBack.length - 1; i+=2){
            keyboard.push([ `@${jsonData.idontFollowBack[i]['username']}`, `@${jsonData.idontFollowBack[i+1]['username']}` ]);
        }
        if(jsonData.idontFollowBack.length % 2 != 0){
            keyboard.push([ `@${jsonData.idontFollowBack[jsonData.idontFollowBack.length-1]['username']}` ])
        }
        ctx.replyWithHTML(`👨🏻‍💻<b>Я не подписан в ответ на ${jsonData.idontFollowBack.length} ч.</b>`, 
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
    else{

    }
});

lk.hears('👱🏻‍♀️Новые подписчики', ctx => {
    let keyboard = [['📲Назад']];
    let jsonData;
    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        for(let i = 0; i < jsonData.newFollowers.length - 1; i+=2){
            keyboard.push([ `@${jsonData.newFollowers[i]['username']}`, `@${jsonData.newFollowers[i+1]['username']}` ]);
        }
        if(jsonData.newFollowers.length % 2 != 0){
            keyboard.push([ `@${jsonData.newFollowers[jsonData.newFollowers.length-1]['username']}` ])
        }
        ctx.replyWithHTML(`👱🏻‍♀️<b>Новых подписчиков с момента последнего анализа: ${jsonData.newFollowers.length}</b>`, 
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
    else{

    }
});

lk.hears('🤦🏼‍♀️Потерянные подписчики', ctx => {
    let keyboard = [['📲Назад']];
    let jsonData;
    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        for(let i = 0; i < jsonData.lostFollowers.length - 1; i+=2){
            keyboard.push([ `@${jsonData.lostFollowers[i]['username']}`, `@${jsonData.lostFollowers[i+1]['username']}` ]);
        }
        if(jsonData.lostFollowers.length % 2 != 0){
            keyboard.push([ `@${jsonData.lostFollowers[jsonData.lostFollowers.length-1]['username']}` ])
        }
        ctx.replyWithHTML(`🤦🏼‍♀️<b>Потерянных подписчиков с момента последнего анализа: ${jsonData.lostFollowers.length}</b>`, 
        Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
    }
    else{

    }
});

lk.hears('🧟‍♀️Подписчики-зомби', ctx => {
    ctx.replyWithHTML('🧟‍♀️ <b>В разработке</b> 🧟‍♀️');
});

lk.hears('👸🏼Топ подписчиков', ctx => {
    ctx.replyWithHTML('👸🏼 <b>В разработке</b> 👸🏼');
});



lk.hears('📲Назад', ctx => {
    ctx.scene.reenter();
});

lk.on('message', ctx => {
    if(ctx.message.text.indexOf('@') == 0){
        ctx.reply(`https://instagram.com/${ctx.message.text.slice(1)}`);
    }
    else{
        ctx.reply('Неизвестная команда. Воспользуйся меню')
    }
})

// newAcc.enter(ctx => {})

newAcc.hears('✅Да', ctx => {
    console.log('delete');
    delete ctx.session.isLoggedIn;
    if(fs.existsSync(`./userdata/${ctx.message.from.username}.json`))
        fs.unlink(`./userdata/${ctx.message.from.username}.json`, res => {});
    if(fs.existsSync(`./cookie/${ctx.message.from.username}`))
        fs.unlink(`./cookie/${ctx.message.from.username}`, res => {});

    delete ctx.session.parser;
    delete ctx.session.userAccount;
    ctx.scene.enter('nickname');
});

newAcc.hears('❎Нет',ctx => {
    ctx.scene.enter('menuLoggedIn');
})

forgetMe.hears('✅Да', ctx => {
    console.log('delete');
    delete ctx.session.isLoggedIn;
    if(fs.existsSync(`./userdata/${ctx.message.from.username}.json`))
        fs.unlink(`./userdata/${ctx.message.from.username}.json`, res => {});
    if(fs.existsSync(`./cookie/${ctx.message.from.username}`))
        fs.unlink(`./cookie/${ctx.message.from.username}`, res => {});

    delete ctx.session.parser;
    delete ctx.session.userAccount;
    ctx.scene.enter('menu');
});

forgetMe.hears('❎Нет',ctx => {
    ctx.scene.enter('menuLoggedIn');
})

/* Registering scenes */
const stage = new Stage();
stage.register(nickname);
stage.register(password);
stage.register(menu);
stage.register(menuLoggedIn);
stage.register(lk);
stage.register(tfa);
stage.register(newAcc);
stage.register(forgetMe);

/* Making staging work, initializing session for personalized statistics */
bot.use(session())
bot.use(stage.middleware())

/* On /start event handler */
bot.start(async (ctx) => {
    let jsonData;
    let existsFile = false;
    if(fs.existsSync('./botUsers.json')){
        jsonData = JSON.parse(fs.readFileSync('./botUsers.json'));
        let userExists = false;
        jsonData.users.forEach(i => {
            if(i['userId'] == ctx.from.id){
                userExists = true;
                return;
            }
        })
        if(!userExists){
            jsonData.users.push({'username': ctx.message.from.username, 'userId': ctx.from.id});
            let data = JSON.stringify(jsonData, null, 2);
            fs.writeFileSync('./botUsers.json', data);
        }
    }

    if(fs.existsSync('./userdata/' + ctx.message.from.username + '.json')){
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.message.from.username + '.json'));
        existsFile = true;
    }
    if(!ctx.session.isLoggedIn && existsFile && jsonData.loggedIn){
        ctx.session.isLoggedIn = true;
        ctx.session.userAccount = jsonData.igNickname;

        if(!ctx.session.parser){
            ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
        }
    }
    /* if(!ctx.session.parser && ctx.session.userAccount){
        ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
    } */
    await ctx.replyWithHTML('💻<b>Привет!</b>. Если будут предложения или баги - сразу пиши @belotserkovtsev');
    // ctx.scene.enter('tfa');
    if(ctx.session.isLoggedIn)
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

        if(!ctx.session.parser){
            ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
        }
    }
    /* if(!ctx.session.parser && ctx.session.userAccount){
        ctx.session.parser = new Parser(ctx.session.userAccount, ctx.message.from.username);
    } */
    await ctx.replyWithHTML('💻<b>Бот был отключен для технического обслуживания</b>. Но теперь все в порядке. Твоя сессия восстановлена');
    // ctx.scene.enter('tfa');
    if(ctx.session.isLoggedIn)
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
})



bot.launch();
