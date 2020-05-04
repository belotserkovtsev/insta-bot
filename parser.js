const { Curl } = require('node-libcurl');
const crypto = require('crypto');
const fs = require('fs');
const cheerio = require('cheerio')
const sealedbox = require('tweetnacl-sealedbox-js');

module.exports = class Parser{

    constructor(username, tgUsername){
        this.username = username;
        this.tgUsername = tgUsername;
    }

    encrypt({password, publicKey, publicKeyId}) {
        const time = Date.now().toString();
        const key = crypto.pseudoRandomBytes(32);
        const iv = Buffer.alloc(12, 0);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(time));
        const aesEncrypted = Buffer.concat([cipher.update(Buffer.from(password)), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const encryptedKey = sealedbox.seal(key, Buffer.from(publicKey, 'hex'));
        return {
        encrypted: Buffer.concat([
            Buffer.from([
            1,
            Number(publicKeyId),
            encryptedKey.byteLength & 255,
            (encryptedKey.byteLength >> 8) & 255,
            ]),
            encryptedKey,
            authTag,
            aesEncrypted,
        ]).toString('base64'),
        time,
        };
    }

    getrequest(url = ''){
        return new Promise((resolve, reject) => {
            const getCurl = new Curl();
    
            getCurl.setOpt('URL', 'https://www.instagram.com' + url);
            getCurl.setOpt('FOLLOWLOCATION', true);
            getCurl.setOpt('COOKIEFILE', './cookie/' + this.username);
            getCurl.setOpt('COOKIEJAR', './cookie/' + this.username);
            getCurl.setOpt('SSL_VERIFYHOST', false);
            getCurl.setOpt('SSL_VERIFYPEER', false);
            //curl.setOpt('RETURNTRANSFER', true);
            getCurl.setOpt('USERAGENT', `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36`);


            getCurl.on('end', function (statusCode, data, headers) {
                this.close();
                resolve({'statusCode': statusCode, 'data': data, 'headers': headers});
            });
            getCurl.on('error', getCurl.close.bind(getCurl));

            getCurl.perform();
            })
        
    }

    postRequest(url, csrftoken, login, password, enc_pass, headers){
        return new Promise((resolve, reject) =>{
            const postCurl = new Curl();
    
            postCurl.setOpt('URL', 'https://www.instagram.com' + url);
            postCurl.setOpt('FOLLOWLOCATION', true);
            postCurl.setOpt('COOKIEFILE', './cookie/' + this.username);
            postCurl.setOpt('COOKIEJAR', './cookie/' + this.username);
            //curl.setOpt('HEADER', true);
            postCurl.setOpt('SSL_VERIFYHOST', false);
            postCurl.setOpt('SSL_VERIFYPEER', false);
            postCurl.setOpt('USERAGENT', `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36`);
            postCurl.setOpt('POST', true);
            
            postCurl.setOpt('POSTFIELDS', 'username=' + login + '&enc_password='+ encodeURIComponent(enc_pass) + '&password=' + encodeURIComponent(password) + '&queryParams=' + encodeURIComponent('{}') + '&optIntoOneTap=false&password=' + encodeURIComponent(password))
            postCurl.setOpt('HTTPHEADER', [
                'Content-Type: application/x-www-form-urlencoded',
                'X-CSRFToken: ' + csrftoken,
                //'user-agent'
                //'x-fb-trip-id: 1679558926'
                //'X-IG-App-ID: 936619743392459',
                //'Cookie: ig_did=93A5C25E-59A4-483C-9485-F55777B2A7E9; csrftoken=LbNBEkGX8Q2XW2M8Cr6QbUViqvFkuaT5; mid=Xqc_ywALAAG04OD5OoS4Ay2xC9zI'
            ])


            postCurl.on('end', function (statusCode, data, headers) {
                console.log(data);
                console.info(statusCode);
                console.info('---');
                console.info(data.length);
                console.info('---');
                console.info(this.getInfo( 'TOTAL_TIME'));
                resolve({'statusCode': statusCode, 'data': data, 'headers': headers});
                this.close();
            });
            
            postCurl.on('error', postCurl.close.bind(postCurl));
            postCurl.perform();
        })
        
    }

    async login(login, pass){
        let token;
        let enc_pass;
        let pubKey;
        let pubKeyId;
        await this.getrequest('/accounts/login').then((arr) => {
            arr['headers'][1]['Set-Cookie'].forEach(i => {
                if(i.indexOf('csrftoken') != -1){
                    token = i.split(';')[0].split('=')[1];
                }
            });

            pubKey = arr['headers'][1]['ig-set-password-encryption-web-pub-key'];
            pubKeyId = arr['headers'][1]['ig-set-password-encryption-web-key-id'];

        }).catch(err => {
            console.log(err);
        })
        console.log(pubKey);
        console.log(pubKeyId);
        console.log(token);
        
        let encPassData = this.encrypt({password: pass, publicKey: pubKey, publicKeyId: pubKeyId});
        console.log(encPassData);
        enc_pass = `#PWD_INSTAGRAM_BROWSER:6:${encPassData['time']}:${encPassData['encrypted']}`;
        return await this.postRequest('/accounts/login/ajax/', token, login, pass, enc_pass, '');
    }

    async getFollowers(id){
        let end_cursor;
        let hasNextPage;
        let followers = Array();
        let idontFollowBack = Array();
        await this.getrequest('/graphql/query/?query_hash=' + encodeURIComponent('c76146de99bb02f6415203be841dd25a') + '&variables=' + encodeURIComponent('{"id":"' + id + '","include_reel":true,"fetch_mutual":true,"first":50}'))
        .then(res => {
            //fs.writeFileSync('./userdata/js', res['data']);
            let jsonData = JSON.parse(res['data']);
            hasNextPage = jsonData.data.user.edge_followed_by.page_info.has_next_page;
            end_cursor = jsonData.data.user.edge_followed_by.page_info.end_cursor;

            jsonData.data.user.edge_followed_by.edges.forEach(i => {
                followers.push({'id': i.node.id, 'username': i.node.username});
                if(!i.node.followed_by_viewer)
                    idontFollowBack.push({'id': i.node.id, 'username': i.node.username});
                // console.log(i.node.username);
            });
            
        })
        
        .catch(err => {
            console.log(err)
        })

        while(hasNextPage){
            await this.getrequest('/graphql/query/?query_hash=' + encodeURIComponent('c76146de99bb02f6415203be841dd25a') + '&variables=' + encodeURIComponent('{"id":"' + id + '","include_reel":true,"fetch_mutual":true,"first":50,"after":"' + end_cursor + '"}'))
            .then(res => {
                
                jsonData = JSON.parse(res['data']);
                hasNextPage = jsonData.data.user.edge_followed_by.page_info.has_next_page;
                console.log(hasNextPage);
                jsonData.data.user.edge_followed_by.edges.forEach(i => {
                    followers.push({'id': i.node.id, 'username': i.node.username});
                    if(!i.node.followed_by_viewer)
                        idontFollowBack.push({'id': i.node.id, 'username': i.node.username});
                    // console.log(i.node.username);
                })
                if(hasNextPage)
                    end_cursor = jsonData.data.user.edge_followed_by.page_info.end_cursor;
            })

            .catch(err => {
                console.log(err);
            })
        }


        let data = fs.readFileSync('./userdata/' + this.tgUsername + '.json');
        let newFollowers = new Array();
        let lostFollowers = new Array();
        data = JSON.parse(data);
        followers.forEach(i => {
            let isOldUser = false;
            data.followers.forEach(j => {
                if(i.id == j.id){
                    isOldUser = true;
                    return;
                }
            })
            if(!isOldUser)
                newFollowers.push(i.username);
        });

        data.followers.forEach(i => {
            let isOldUser = false;
            followers.forEach(j => {
                if(i.id == j.id){
                    isOldUser = true;
                    return;
                }
            })
            if(!isOldUser)
                lostFollowers.push(i.username)
        });

        data.followers = followers
        data.idontFollowBack = idontFollowBack;
        data = JSON.stringify(data, null, 2);
        fs.writeFileSync('./userdata/' + this.tgUsername + '.json', data);

        return {'followers': followers, 'idontFollowBack': idontFollowBack, 'newFollowers': newFollowers, 'lostFollowers': lostFollowers};
        
    }
}
// getFollowers().then(res => {
//     console.log(res[0]);
//     console.log(res[1]);
//     console.log(res[2]);
//     console.log(res[3])
// })
// .catch(err => {
//     console.log(err)
// });

