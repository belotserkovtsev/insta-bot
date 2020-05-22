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
const newAcc = new BaseScene('newAcc');
const forgetMe = new BaseScene('forgetMe');
const challenge = new BaseScene('challenge');

tfa.enter(async (ctx) => {
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

tfa.hears('📬SMS', async (ctx) => {
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

tfa.hears('Резервные коды', ctx => {
    ctx.replyWithHTML('❎<b>Резервные коды временно не поддерживаются</b>. Попробуй другой способ');
});

tfa.hears('💔Отмена', async(ctx) => {
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
    fs.unlink('./cookie/' + ctx.from.id, res => {});
});

tfa.on('message', async(ctx)=> {
    ctx.session.parser.tfa('auth', ctx.session.identifier, ctx.message.text).then(async (res) => {
        if(res['authenticated']){
            let jsData = res;
            let userData = {
                igNickname : ctx.session.userAccount,
                igId : jsData['userId'],
                tgId : ctx.from.id,
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
            fs.writeFile('./userdata/' + ctx.from.id + '.json', data, err =>{
                if(!err){
                    ctx.session.isLoggedIn = true;
                    delete ctx.session.identifier;
                    delete ctx.session.sms;
                    delete ctx.session.totp;
                    delete ctx.session.phone;
                    ctx.scene.enter('menuLoggedIn');
                }
            });
        }

        else if(res['message'] == 'checkpoint_required'){
            delete ctx.session.userPassword;
            let jsData = res;
            let userData = {
                igNickname : ctx.session.userAccount,
                igId : jsData['checkpoint_url'].split('/')[2],
                tgId : ctx.from.id,
                rights: 0,
                timeupdate: null,
                loggedIn: false,
                isFirstParse: true,
                followers:[],
                following: [],
                idontFollowBack: [],
                dontFollowMeBack: []
            }
            let data = JSON.stringify(userData, null, 2);
            fs.writeFile('./userdata/' + tgId + '.json', data, err=>{
                if(!err){
                    ctx.session.isLoggedIn = true;
                    ctx.session.url = jsData['checkpoint_url'];
                    ctx.scene.enter('challenge');
                }
            });
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
            fs.unlink('./cookie/' + ctx.from.id, res => {});
        }
        
        
        
        
    })
    .catch(err => {
        console.log(err);
        ctx.replyWithHTML('❎<b>Бот не может войти в аккаунт. Произошла внутрення ошибка</b>. Напиши @belotserkovtsev если считаешь что это баг или попробуй еще раз');
        ctx.scene.enter('menu');
    })
})


password.enter(async(ctx) => {
    ctx.replyWithHTML('🔐Введи пароль от инстаграм. Бот <b>не хранит</b> и <b>не передает</b> твой пароль третьим лицам',
    Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra())
})

password.hears('💔Отменить', async (ctx) => {
    delete ctx.session.parser;
    fs.unlink('./cookie/' + ctx.from.id, res => {});
    delete ctx.session.userAccount;
    ctx.scene.enter('menu');
});

password.on('sticker', async (ctx) => ctx.reply('👍'));

password.on('message', async(ctx) => {
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
                    tgId : ctx.from.id,
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
                fs.writeFile('./userdata/' + ctx.from.id + '.json', data, err=>{
                    if(!err){
                        ctx.session.isLoggedIn = true;
                        delete ctx.session.userPassword;
                        ctx.scene.enter('menuLoggedIn');
                    }
                });
                
            }
            else if(jsData['user']){
                ctx.replyWithHTML('🔒<b>Пароль введен неверно</b>! Попробуй еще раз',
                Telegraf.Markup.keyboard([['💔Отменить']]).oneTime().resize().extra());
                delete ctx.session.userPassword;
            }
            else if(jsData['message'] == 'checkpoint_required'){
                delete ctx.session.userPassword;
                let userData = {
                    igNickname : ctx.session.userAccount,
                    igId : jsData['checkpoint_url'].split('/')[2],
                    tgId : ctx.from.id,
                    rights: 0,
                    timeupdate: null,
                    loggedIn: false,
                    isFirstParse: true,
                    followers:[],
                    following: [],
                    idontFollowBack: [],
                    dontFollowMeBack: []
                }
                let data = JSON.stringify(userData, null, 2);
                fs.writeFile('./userdata/' + ctx.from.id + '.json', data, err=>{
                    if(!err){
                        ctx.session.isLoggedIn = true;
                        ctx.session.url = jsData['checkpoint_url'];
                        ctx.scene.enter('challenge');
                    }
                });
            }
            else{
                delete ctx.session.userPassword;
                delete ctx.session.parser;
                ctx.replyWithHTML('❎<b>Бот не может войти в аккаунт. Введенного логина не существует или произошла внутрення ошибка</b>. Напиши @belotserkovtsev если считаешь что это баг');
                // if(fs.existsSync('./cookie/' + ctx.message.from.username))
                fs.unlink('./cookie/' + ctx.from.id, res => {});
                delete ctx.session.userAccount;
                ctx.scene.enter('menu');
            }
        }).catch(async(err) => {
            console.log(err);
            ctx.replyWithHTML('❎<b>Бот не может войти в аккаунт. Произошла внутрення ошибка</b>. Напиши @belotserkovtsev если считаешь что это баг или попробуй еще раз');
            ctx.scene.enter('menu');
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
nickname.hears('💔Отменить', async(ctx) => {
    if(ctx.session.isLoggedIn)
        ctx.scene.enter('menuLoggedIn');
    else
        ctx.scene.enter('menu');
});

nickname.on('sticker', (ctx) => ctx.reply('👍'));

nickname.on('message', async(ctx) => {
    try{
        if(ctx.message.text == '✅Да'){
            ctx.session.parser = new Parser(ctx.session.userAccount, ctx.from.id);
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
    }
    catch{
        ctx.replyWithHTML('❎<b>Произошла внутренняя ошибка</b>. Попробуй еще раз');
        ctx.scene.enter('menu');
    }
    
});

menu.enter(async(ctx) => {
    ctx.reply('📱Главное меню',Telegraf.Markup.keyboard([['🔍Войти в аккаунт', '🧬Соглашение'], ['💣Сообщить о баге', '🧭О боте']]).oneTime().resize().extra());
});

menu.hears('💣Сообщить о баге', async(ctx) => {
    ctx.reply('Напиши мне что случилось: \n@belotserkovtsev')
});

menu.hears('🔍Войти в аккаунт', Stage.enter('nickname'));

menu.hears('🧭О боте', async(ctx) => {
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

menu.hears('🧬Соглашение', async(ctx) => {
    ctx.replyWithHTML(`Для корректной работы и анализа страницы потребуется единоразово ввести логин и пароль от Инстаграм, после чего он будет навсегда удален из памяти сервера.

Могу заверить, что пароли <b>не передаются</b> третьим лицам, <b>не записываются</b> и <b>не хранятся</b> на сервере ни в каком виде. Для того, чтобы анализировать страницу, бот записывает сессионные куки в файл и кладет его на сервер. В любой момент ты сможешь нажать кнопку 📵<b>Забыть меня</b> и сессионные куки будут удалены.
    
<b>Продолжая использование, ты соглашаешься передать сессионные куки боту (и на обработку персональных данных, таких как подписки, подписчики, лайки, отметки «сохранить»)</b>
    
Этот бот полностью open source, так что ты можешь <a href="https://github.com/belotserkovtsev/insta-bot">изучать его код</a>, следить за версиями или клонировать этот репозиторий для личного некоммерческого использования. Будем считать что это мои terms of service 😁`);
});

menu.on('message', async(ctx) => {
    ctx.reply('Неизвестная команда. Воспользуйся меню')
});

menuLoggedIn.enter(async(ctx) => {
    ctx.replyWithHTML('📱<b>Главное меню</b>',Telegraf.Markup.keyboard([['📟Личный кабинет', '🧬Анализировать'], ['🔍Сменить аккаунт', '🧭О боте'] ,['💣Сообщить о баге', '📵Забыть меня']]).oneTime().resize().extra());
})

menuLoggedIn.hears('📟Личный кабинет', Stage.enter('lk'));

menuLoggedIn.hears('🧬Анализировать', async (ctx) => {
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    if(ctx.session.isLoggedIn && (jsonData.isFirstParse || jsonData.rights > 0 || (jsonData.rights == 0 && jsonData.timeupdate/1000 <= (Date.now()/1000)-86400))){
        await ctx.reply('🔮 Запускаю анализатор...');

        let outputString = '\n🚀 <b>Статистическая сводка</b> 🚀\n\n'
        let outputStringEnd = '';

        ctx.session.parser.getFollowers(jsonData.igId).then(async (res) => {
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
            outputStringEnd += `👍🏻 Новых подписчиков: <b>${newFollowers}</b>\n\n👎🏻 От меня отписались: <b>${lostFollowers}</b>\n`;

            ctx.session.parser.getFollowing(jsonData.igId).then(async (res) => {
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
                    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
                    jsonData.isFirstParse = false;
                    jsonData.timeupdate = Date.now();
                    jsonData.monthlyTimeupdate = Date.now();
                    jsonData.newFollowers = [];
                    jsonData.monthlyFollowers = jsonData.followers.length;
                    jsonData.monthlyFollowing = jsonData.following.length;
                    await ctx.replyWithHTML('🔮<b>Первый анализ успешно завершен</b>. Ниже представлена краткая статистическая сводка, показывающая базовые изменения статистики, но намного больше информации можно получить, если перейти \nв "📟Личный кабинет"');
                    fs.writeFile('./userdata/' + ctx.from.id + '.json', JSON.stringify(jsonData, null, 2), err => {
                        if(err)
                            throw(err);
                    });
                }
                else{
                    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
                    if((jsonData.monthlyTimeupdate/1000) >= Date.now() - (86400*30)){
                        jsonData.monthlyTimeupdate = Date.now();
                        jsonData.monthlyFollowers = jsonData.followers.length;
                        jsonData.monthlyFollowing = jsonData.following.length;
                    }
                    jsonData.timeupdate = Date.now();
                    fs.writeFile('./userdata/' + ctx.from.id + '.json', JSON.stringify(jsonData, null, 2), err => {
                        if(err)
                            throw(err);
                    });
                }
                outputString += outputStringEnd;
                ctx.replyWithHTML(outputString);
            })
        })
        .catch(err => {
            console.log(err);
            ctx.replyWithHTML(`🧬<b>Произошла внутренняя ошибка. Сообщи @belotserkovtsev об этом</b>`);
        });
        
    }
    else{
        let secondsLeft = Math.floor((jsonData.timeupdate/1000)+86400-(Date.now()/1000));
        let hours = Math.floor((secondsLeft/60)/60);
        let minutes = Math.floor((secondsLeft/60) - hours * 60);
        ctx.replyWithHTML(`🧬<b>Следующий анализ будет доступен через ${hours}ч., ${minutes}мин.</b>`);
    }
});

menuLoggedIn.hears('💣Сообщить о баге', async(ctx) => {
    ctx.replyWithHTML('<b>Напиши мне что случилось</b>: \n@belotserkovtsev')
});

menuLoggedIn.hears('🧭О боте', async(ctx) => {
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

menuLoggedIn.hears('🔍Сменить аккаунт', async(ctx) => {
    ctx.scene.enter('newAcc').then(res => {
        ctx.reply('Все твои данные вместе со статистикой будут стерты. Продолжить?', Telegraf.Markup.keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    });
});

menuLoggedIn.hears('📵Забыть меня', async(ctx) => {
    ctx.scene.enter('forgetMe').then(res => {
        ctx.reply('Все твои данные вместе со статистикой будут стерты. Продолжить?', Telegraf.Markup.keyboard([['✅Да', '❎Нет']]).oneTime().resize().extra());
    });
});

menuLoggedIn.on('message', async(ctx) => {
    try{
        if(ctx.message.text.indexOf('#?') == 0){
            let jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
            if(jsonData.rights == 2){
                jsonData = JSON.parse(fs.readFileSync('./botUsers.json'));
                for(let i = 0; i < jsonData.users.length; ++i){
                    bot.telegram.sendMessage(jsonData.users[i].userId, ctx.message.text.slice(2))
                    .catch(err => {
                        console.log(`user: ${jsonData.users[i].username}, id: ${jsonData.users[i].userId} left bot`);
                    });
                }
            }
            else{
                ctx.reply('У тебя нет прав высылать сообщения пользовтелям бота');
            }
        }
        else
            ctx.reply('Неизвестная команда. Воспользуйся меню')
    }
    catch(err){
        console.log(err);
        ctx.replyWithHTML(`📵Произошла внутренняя ошибка`);
        ctx.scene.reenter();
    }
});

lk.enter(async(ctx) => {
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    if(jsonData.isFirstParse){
        ctx.replyWithHTML('📟<b>Личный кабинет станет доступен после первого анализа</b>. Здесь ты сможешь найти более подробную статистику, посмотреть подписчиков и многое другое. <b>Возвращаю тебя в главное меню</b>')
        .then(res => ctx.scene.enter('menuLoggedIn'));
    }
    else{
        let followersGain = Math.round(((jsonData.followers.length - jsonData.monthlyFollowers) / jsonData.monthlyFollowers)*100);
        let followingGain = Math.round(((jsonData.following.length - jsonData.monthlyFollowing) / jsonData.monthlyFollowing)*100);
        let signFollowersGain, signFollowingGain;
        followersGain >= 0 ? signFollowersGain = '+' : signFollowersGain = '';
        followingGain >= 0 ? signFollowingGain = '+' : signFollowingGain = '';

        ctx.replyWithHTML(`📱 Инстаграм: ${ctx.session.userAccount}\n\n👩🏻‍💻 <b>Подписчиков: ${jsonData.followers.length}</b>\n⚡️${signFollowersGain}${followersGain}% за последний месяц\n\n👨🏻‍💻 <b>Подписок: ${jsonData.following.length}</b>\n⚡️${signFollowingGain}${followingGain}% за последний месяц`
        ,Telegraf.Markup.keyboard([['📱Главное меню'], ['👱🏻‍♀️Новые подписчики', '🤦🏼‍♀️Потерянные подписчики'], ['👨🏻‍💻Я не подписан в ответ', '🙅🏻На меня не подписаны в ответ'], ['🧟‍♀️Подписчики-зомби', '👸🏼Топ подписчиков']]).oneTime().resize().extra());
    }
    
});

lk.hears('📱Главное меню', async(ctx) => {
    ctx.scene.enter('menuLoggedIn');
});

lk.hears('🙅🏻На меня не подписаны в ответ', async(ctx) => {
    let keyboard = [['📲Назад']];
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    for(let i = 0; i < jsonData.dontFollowMeBack.length - 1; i+=2){
        keyboard.push([ `@${jsonData.dontFollowMeBack[i]['username']}`, `@${jsonData.dontFollowMeBack[i+1]['username']}` ]);
    }
    if(jsonData.dontFollowMeBack.length % 2 != 0){
        keyboard.push([ `@${jsonData.dontFollowMeBack[jsonData.dontFollowMeBack.length-1]['username']}` ])
    }
    ctx.replyWithHTML(`🙅🏻<b>На меня не подписано в ответ ${jsonData.dontFollowMeBack.length} ч.</b>`, 
    Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
});

lk.hears('👨🏻‍💻Я не подписан в ответ', async(ctx) => {
    let keyboard = [['📲Назад']];
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    for(let i = 0; i < jsonData.idontFollowBack.length - 1; i+=2){
        keyboard.push([ `@${jsonData.idontFollowBack[i]['username']}`, `@${jsonData.idontFollowBack[i+1]['username']}` ]);
    }
    if(jsonData.idontFollowBack.length % 2 != 0){
        keyboard.push([ `@${jsonData.idontFollowBack[jsonData.idontFollowBack.length-1]['username']}` ])
    }
    ctx.replyWithHTML(`👨🏻‍💻<b>Я не подписан в ответ на ${jsonData.idontFollowBack.length} ч.</b>`, 
    Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
});

lk.hears('👱🏻‍♀️Новые подписчики', async(ctx) => {
    let keyboard = [['📲Назад']];
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    for(let i = 0; i < jsonData.newFollowers.length - 1; i+=2){
        keyboard.push([ `@${jsonData.newFollowers[i]['username']}`, `@${jsonData.newFollowers[i+1]['username']}` ]);
    }
    if(jsonData.newFollowers.length % 2 != 0){
        keyboard.push([ `@${jsonData.newFollowers[jsonData.newFollowers.length-1]['username']}` ])
    }
    ctx.replyWithHTML(`👱🏻‍♀️<b>Новых подписчиков с момента последнего анализа: ${jsonData.newFollowers.length}</b>`, 
    Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
});

lk.hears('🤦🏼‍♀️Потерянные подписчики', async(ctx) => {
    let keyboard = [['📲Назад']];
    let jsonData;
    jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
    for(let i = 0; i < jsonData.lostFollowers.length - 1; i+=2){
        keyboard.push([ `@${jsonData.lostFollowers[i]['username']}`, `@${jsonData.lostFollowers[i+1]['username']}` ]);
    }
    if(jsonData.lostFollowers.length % 2 != 0){
        keyboard.push([ `@${jsonData.lostFollowers[jsonData.lostFollowers.length-1]['username']}` ])
    }
    ctx.replyWithHTML(`🤦🏼‍♀️<b>Потерянных подписчиков с момента последнего анализа: ${jsonData.lostFollowers.length}</b>`, 
    Telegraf.Markup.keyboard(keyboard).oneTime().resize().extra());
});

lk.hears('🧟‍♀️Подписчики-зомби', async(ctx) => {
    ctx.replyWithHTML('🧟‍♀️ <b>В разработке</b> 🧟‍♀️');
});

lk.hears('👸🏼Топ подписчиков', async(ctx) => {
    ctx.replyWithHTML('👸🏼 <b>В разработке</b> 👸🏼');
});



lk.hears('📲Назад', async(ctx) => {
    ctx.scene.reenter();
});

lk.on('message', async(ctx) => {
    if(ctx.message.text.indexOf('@') == 0){
        ctx.reply(`https://instagram.com/${ctx.message.text.slice(1)}`);
    }
    else{
        ctx.reply('Неизвестная команда. Воспользуйся меню')
    }
})

// newAcc.enter(ctx => {})

newAcc.hears('✅Да', async(ctx) => {
    delete ctx.session.isLoggedIn;
    fs.unlink(`./userdata/${ctx.from.id}.json`, res => {});
    fs.unlink(`./cookie/${ctx.from.id}`, res => {});

    delete ctx.session.parser;
    delete ctx.session.userAccount;
    ctx.scene.enter('nickname');
});

newAcc.hears('❎Нет', async(ctx) => {
    ctx.scene.enter('menuLoggedIn');
})

forgetMe.hears('✅Да', async(ctx) => {
    // console.log('delete');
    delete ctx.session.isLoggedIn;
    fs.unlink(`./userdata/${ctx.from.id}.json`, res => {});
    fs.unlink(`./cookie/${ctx.from.id}`, res => {});

    delete ctx.session.parser;
    delete ctx.session.userAccount;
    ctx.scene.enter('menu');
});

forgetMe.hears('❎Нет',async(ctx) => {
    ctx.scene.enter('menuLoggedIn');
});

challenge.enter(async(ctx) => {
    ctx.session.parser.challenge('getsms', ctx.session.url);
    ctx.replyWithHTML(`🔐<b>Требуется подтвердить вход с незнакомого устройства.</b> На твой номер выслан код подтверждения. Введи его сюда`,
    Telegraf.Markup.keyboard(['💔Отмена']).oneTime().resize().extra());
});

challenge.hears('💔Отмена', async(ctx) => {
    delete ctx.session.parser;
    delete ctx.session.url;
    fs.unlink('./cookie/' + ctx.from.id, res => {});
    delete ctx.session.userAccount;
    ctx.scene.enter('menu');
});

challenge.on('message', async (ctx)=>{
    try{
        ctx.session.parser.challenge('postsms', ctx.session.url, ctx.message.text).then(async(res)=>{
            let jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
            jsonData.loggedIn = true;
            fs.writeFile('./userdata/' + ctx.from.id + '.json', JSON.stringify(jsonData, null, 2), err => {
                if(err)
                    throw(err);
            });
            ctx.scene.enter('menuLoggedIn');
        })
        
    }
    catch{
        ctx.replyWithHTML(`🔐<b>Ошибка. Попробуй снова</b>`);
        ctx.scene.enter('menu');
    }
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
stage.register(challenge);

/* Making staging work, initializing session for personalized statistics */
bot.use(session())
bot.use(stage.middleware())

/* On /start event handler */
bot.start(async (ctx) => {
    try{
        let jsonData;
        let existsFile = false;
        jsonData = JSON.parse(fs.readFileSync('./botUsers.json'));
        let userExists = false;
        jsonData.users.forEach(i => {
            if(i['userId'] == ctx.from.id){
                userExists = true;
                return;
            }
        })
        if(!userExists){
            jsonData.users.push({'username': ctx.from.username, 'userId': ctx.from.id});
            let data = JSON.stringify(jsonData, null, 2);
            fs.writeFile('./botUsers.json', data, err => {
                if(err)
                    console.log(err);
            });
        }

        if(fs.existsSync('./userdata/' + ctx.from.id + '.json')){
            jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
            existsFile = true;
        }
        if(!ctx.session.isLoggedIn && existsFile && jsonData.loggedIn){
            ctx.session.isLoggedIn = true;
            ctx.session.userAccount = jsonData.igNickname;

            if(!ctx.session.parser){
                ctx.session.parser = new Parser(ctx.session.userAccount, ctx.from.id);
            }
        }
        await ctx.replyWithHTML('💻<b>Привет!</b>. Если будут предложения или баги - сразу пиши @belotserkovtsev')
        .catch(err => {
            console.log(`user: ${ctx.from.username}, id: ${ctx.from.id} error on start`);
            throw err;
        })
        if(ctx.session.isLoggedIn)
            ctx.scene.enter('menuLoggedIn');
        else
            ctx.scene.enter('menu');
    }
    catch{
        ctx.session = null;
    }
});

bot.on('message', async (ctx) => {
    try{
        let jsonData;
        let existsFile = false;
        if(fs.existsSync('./userdata/' + ctx.from.id + '.json')){
            jsonData = JSON.parse(fs.readFileSync('./userdata/' + ctx.from.id + '.json'));
            existsFile = true;
        }
        if(!ctx.session.isLoggedIn && existsFile && jsonData.loggedIn){
            ctx.session.isLoggedIn = true;
            ctx.session.userAccount = jsonData.igNickname;

            if(!ctx.session.parser){
                ctx.session.parser = new Parser(ctx.session.userAccount, ctx.from.id);
            }
        }
        await ctx.replyWithHTML('💻<b>Бот был перезагружен для технического обслуживания</b>. Но теперь все в порядке. Твоя сессия восстановлена')
        .catch(err => {
            console.log(`user: ${ctx.from.username}, id: ${ctx.from.id} error on start`);
            throw err;
        })
        if(ctx.session.isLoggedIn)
            ctx.scene.enter('menuLoggedIn');
        else
            ctx.scene.enter('menu');
    }
    catch{
        ctx.session = null;
    }
})



bot.launch();