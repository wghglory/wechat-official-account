const Koa = require('koa');
const Router = require('koa-router');
const static = require('koa-static');
const bodyParser = require('koa-bodyparser');
const axios = require('axios');
const wechat = require('co-wechat');
const conf = require('./conf');

const app = new Koa();
const router = new Router();

app.use(bodyParser());
app.use(static(__dirname + '/'));

/*
  接口 1：消息接口，co-wechat实现
  在微信测试公众号沙箱中，输入 message，微信公众号会回复你 Hello World.
  具体内部实现可以参考 co-wechat-source-learning.js
*/
router.all(
  '/wechat',
  wechat(conf).middleware(async (message) => {
    console.log('wechat: ', message);
    return 'Hello World ' + message.Content;
  }),
);

/*
// 后端 access_token, 用于访问 getFollowers 等 API
const tokenCache = {
  access_token: '',
  updateTime: Date.now(),
  expires_in: 7200,
};

// 接口 2：获取 access_token
router.get('/getTokens', async (ctx) => {
  const wxDomain = `https://api.weixin.qq.com`;
  const path = `/cgi-bin/token`;
  const param = `?grant_type=client_credential&appid=${conf.appid}&secret=${conf.appsecret}`;
  const url = wxDomain + path + param;
  const res = await axios.get(url);

  // res:     { data: { access_token: 'xxxx', expires_in: 7200 }, status: 200 }

  Object.assign(tokenCache, res.data, {
    updateTime: Date.now(),
  });
  ctx.body = res.data;
});

// 接口 3：使用 access_token 来调用 getFollowers
router.get('/getFollowers', async (ctx) => {
  const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${tokenCache.access_token}`;
  const res = await axios.get(url);
  console.log('getFollowers: ', res);
  ctx.body = res.data;
}); */

/**
 * 使用 co-wechat-api 实现接口 2 和接口 3。实际项目用这个
 */
const { ServerToken, ClientToken } = require('./mongoose');

const WechatAPI = require('co-wechat-api');

const api = new WechatAPI(
  conf.appid,
  conf.appsecret,
  // 取Token
  async () => await ServerToken.findOne(),
  // 存Token
  async (token) => await ServerToken.updateOne({}, token, { upsert: true }),
);

router.get('/getFollowers', async (ctx) => {
  let res = await api.getFollowers();
  res = await api.batchGetUsers(res.data.openid, 'zh_CN');
  ctx.body = res;
});

const OAuth = require('co-wechat-oauth');
const oauth = new OAuth(
  conf.appid,
  conf.appsecret,
  async function(openid) {
    return await ClientToken.getToken(openid);
  },
  async function(openid, token) {
    return await ClientToken.setToken(openid, token);
  },
);

// OAuth2 生成引导用户点击的 URL
router.get('/wxAuthorize', async (ctx, next) => {
  const state = ctx.query.id;
  // const target = ctx.href
  console.log('ctx...' + ctx.href);
  // 目标地址
  redirectUrl = ctx.href;
  redirectUrl = redirectUrl.replace('wxAuthorize', 'wxCallback');
  const scope = 'snsapi_userinfo';

  var url = oauth.getAuthorizeURL(redirectUrl, state, scope);
  console.log('url: ' + url);
  ctx.redirect(url);
});

// 获取AccessToken
router.get('/wxCallback', async (ctx, next) => {
  const code = ctx.query.code;
  // 授权码
  console.log('getAccessToken', code);
  var token = await oauth.getAccessToken(code);
  var accessToken = token.data.access_token;
  var openid = token.data.openid;
  console.log('getAccessToken....');
  console.log('accessToken', accessToken);
  console.log('openid', openid);
  // ctx.body = token

  ctx.redirect('/?openid=' + openid);
});

router.get('/getUser', async (ctx, next) => {
  const openid = ctx.query.openid;
  console.log('getUser', openid);
  var userInfo = await oauth.getUser(openid);
  console.log('userInfo:', userInfo);
  ctx.body = userInfo;
});

router.get('/getJsConfig', async (ctx) => {
  console.log('getJSSDK...', ctx.query);

  var res = await api.getJsConfig(ctx.query);
  console.log('res', res);
  ctx.body = res;
});

app.use(router.routes()); /*启动路由*/
app.use(router.allowedMethods());
app.listen(3000);
