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

    encrypt({password, publicKey, publicKeyId}){
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
            getCurl.setOpt('COOKIEFILE', './cookie/' + this.tgUsername);
            getCurl.setOpt('COOKIEJAR', './cookie/' + this.tgUsername);
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

    postRequest(url, csrftoken, postFields){
        return new Promise((resolve, reject) =>{
            const postCurl = new Curl();
    
            postCurl.setOpt('URL', 'https://www.instagram.com' + url);
            postCurl.setOpt('FOLLOWLOCATION', true);
            postCurl.setOpt('COOKIEFILE', './cookie/' + this.tgUsername);
            postCurl.setOpt('COOKIEJAR', './cookie/' + this.tgUsername);
            //curl.setOpt('HEADER', true);
            postCurl.setOpt('SSL_VERIFYHOST', false);
            postCurl.setOpt('SSL_VERIFYPEER', false);
            postCurl.setOpt('USERAGENT', `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36`);
            postCurl.setOpt('POST', true);
            
            postCurl.setOpt('POSTFIELDS', postFields)
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
        let postFields;
        let pubKey;
        let pubKeyId;
        let pubKeyV;
        await this.getrequest('/accounts/login').then((arr) => {
            arr['headers'][1]['Set-Cookie'].forEach(i => {
                if(i.indexOf('csrftoken') != -1){
                    token = i.split(';')[0].split('=')[1];
                }
            });

            pubKey = arr['headers'][1]['ig-set-password-encryption-web-pub-key'];
            pubKeyId = arr['headers'][1]['ig-set-password-encryption-web-key-id'];
            pubKeyV = arr['headers'][1]['ig-set-password-encryption-web-key-version'];

        }).catch(err => {
            console.log(err);
        })
        console.log(pubKey);
        console.log(pubKeyId);
        console.log(token);
        
        let encPassData = this.encrypt({password: pass, publicKey: pubKey, publicKeyId: pubKeyId});
        // console.log(encPassData);
        enc_pass = `#PWD_INSTAGRAM_BROWSER:${pubKeyV}:${encPassData['time']}:${encPassData['encrypted']}`;
        postFields = 'username=' + login + '&enc_password='+ encodeURIComponent(enc_pass) + '&password=' + encodeURIComponent(pass) + '&queryParams=' + encodeURIComponent('{}') + '&optIntoOneTap=false&password=' + encodeURIComponent(pass);
        this.token = token;
        return await this.postRequest('/accounts/login/ajax/', token, postFields);
    }

    async tfa(method, id, code = ''){
        if(method == 'SMS'){
            let postFields = 'username=' + encodeURIComponent(this.username) + '&identifier=' + encodeURIComponent(id);
            return await this.postRequest('/accounts/send_two_factor_login_sms/', this.token, postFields).then(res => {
                if(JSON.parse(res['data'])['status'] == 'ok'){
                    return res;
                }
                else{
                    return false;
                }
            })
        }
        else if(method == 'auth'){
            let postFields = 'username=' + encodeURIComponent(this.username) + '&verificationCode=' + code + '&identifier=' + encodeURIComponent(id) + '&queryParams=' + encodeURIComponent('{"next":"/"}');
            // console.log(postFields);
            
            return await this.postRequest('/accounts/login/ajax/two_factor/', this.token, postFields).then(res => {
                let response = JSON.parse(res['data']);
                if(response['authenticated']){
                    return response;
                }
                else{
                    return response;
                }
            })
        }

    }

    async getFollowers(id){
        let end_cursor;
        let hasNextPage;
        let jsonData;
        let followers = Array();
        let idontFollowBack = Array();
        await this.getrequest('/graphql/query/?query_hash=' + encodeURIComponent('c76146de99bb02f6415203be841dd25a') + '&variables=' + encodeURIComponent('{"id":"' + id + '","include_reel":true,"fetch_mutual":true,"first":50}'))
        .then(res => {
            //fs.writeFileSync('./userdata/js', res['data']);
            // console.log(res['data']);
            jsonData = JSON.parse(res['data']);
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
                // console.log(hasNextPage);
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
                newFollowers.push({'id': i.id, 'username': i.username});
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
                lostFollowers.push({'id': i.id, 'username': i.username});
        });

        data.followers = followers
        data.idontFollowBack = idontFollowBack;

        data.newFollowers = newFollowers;
        data.lostFollowers = lostFollowers;
        data = JSON.stringify(data, null, 2);
        fs.writeFileSync('./userdata/' + this.tgUsername + '.json', data);

        return {'followers': followers, 'idontFollowBack': idontFollowBack, 'newFollowers': newFollowers, 'lostFollowers': lostFollowers};
        
    }

    async getFollowing(id){
        let end_cursor;
        let hasNextPage;
        let jsonData;
        let following = Array();
        let dontFollowMeBack = Array();
        await this.getrequest('/graphql/query/?query_hash=' + encodeURIComponent('d04b0a864b4b54837c0d870b0e77e076') + '&variables=' + encodeURIComponent('{"id":"' + id + '","include_reel":true,"fetch_mutual":true,"first":50}'))
        .then(res => {
            jsonData = JSON.parse(res['data']);
            hasNextPage = jsonData.data.user.edge_follow.page_info.has_next_page;
            end_cursor = jsonData.data.user.edge_follow.page_info.end_cursor;

            jsonData.data.user.edge_follow.edges.forEach(i => {
                // console.log(i.node.username);
                following.push({'id': i.node.id, 'username': i.node.username});
            });
            
        })
        
        .catch(err => {
            console.log(err)
        })

        while(hasNextPage){
            await this.getrequest('/graphql/query/?query_hash=' + encodeURIComponent('d04b0a864b4b54837c0d870b0e77e076') + '&variables=' + encodeURIComponent('{"id":"' + id + '","include_reel":true,"fetch_mutual":true,"first":50,"after":"' + end_cursor + '"}'))
            .then(res => {
                jsonData = JSON.parse(res['data']);
                hasNextPage = jsonData.data.user.edge_follow.page_info.has_next_page;
                jsonData.data.user.edge_follow.edges.forEach(i => {
                    // console.log(i.node.username);
                    following.push({'id': i.node.id, 'username': i.node.username});
                })
                if(hasNextPage)
                    end_cursor = jsonData.data.user.edge_follow.page_info.end_cursor;
            })

            .catch(err => {
                console.log(err);
            })
        }


        // let data = fs.readFileSync('./userdata/' + this.tgUsername + '.json');
        jsonData = JSON.parse(fs.readFileSync('./userdata/' + this.tgUsername + '.json'));
        jsonData.following = following;
        following.forEach(i => {
            let followsBack = false;
            jsonData.followers.forEach(j => {
                if(i['id'] == j['id']){
                    followsBack = true;
                    return;
                }
            });
            if(!followsBack){
                dontFollowMeBack.push(i);
            }
        });
        jsonData.dontFollowMeBack = dontFollowMeBack;
        fs.writeFileSync('./userdata/' + this.tgUsername + '.json', JSON.stringify(jsonData, null, 2));

        return {'following': following, 'dontFollowMeBack': dontFollowMeBack}
    }
}

