(function(FuseBox){FuseBox.$fuse$=FuseBox;
FuseBox.target = "server";
FuseBox.pkg("default", {}, function(___scope___){
___scope___.file("entrypoint.js", function(exports, require, module, __filename, __dirname){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const path = tslib_1.__importStar(require("path"));
const util = tslib_1.__importStar(require("util"));
const core = tslib_1.__importStar(require("@actions/core"));
const github = tslib_1.__importStar(require("@actions/github"));
const graphql_1 = require("@octokit/graphql");
const ignore_1 = tslib_1.__importDefault(require("ignore"));
const util_1 = require("./util");
const query_1 = require("./query");
const exec = util.promisify(require('child_process').exec);
async function run() {
    try {
        const token = process.env['GITHUB_TOKEN'];
        if (!token) {
            core.setFailed('GITHUB_TOKEN does not exist.');
            return;
        }
        const graphqlWithAuth = graphql_1.graphql.defaults({
            headers: { authorization: `token ${token}` },
        });
        const configPath = path.join(__dirname, core.getInput('configPath'));
        if (!fs.existsSync(configPath)) {
            core.setFailed(`configFile does not exist in ${configPath}.`);
        }
        const config = JSON.parse(fs.readFileSync(configPath).toString());
        util_1.logger.debug('config', config);
        util_1.logger.debug('github.context.eventName', github.context.eventName);
        if (github.context.eventName !== 'pull_request') {
            return;
        }
        const payload = github.context
            .payload;
        util_1.logger.debug('payload.action', payload.action);
        if (payload.action !== 'opened' && payload.action !== 'synchronize') {
            return;
        }
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const number = payload.pull_request.number;
        let result;
        try {
            result = await query_1.getPullRequestAndLabels(graphqlWithAuth, {
                owner,
                repo,
                number,
            });
        }
        catch (error) {
            error();
            core.error(`Request failed: ${JSON.stringify(error.message)}`);
            core.setFailed('getPullRequestAndLabels has been failed.');
        }
        util_1.logger.debug('result', result);
        if (!result) {
            return core.setFailed(`result was empty: ${result}`);
        }
        const allLabels = result.repository.labels.edges.reduce((acc, edge) => {
            acc[edge.node.name] = edge.node.id;
            return acc;
        }, {});
        util_1.logger.debug('allLabels', allLabels);
        const currentLabelNames = new Set(result.repository.pullRequest.labels.edges.map((edge) => edge.node.name));
        util_1.logger.debug('currentLabelNames', Array.from(currentLabelNames));
        const { headRefOid, baseRefOid, headRefName, baseRefName, } = result.repository.pullRequest;
        util_1.logger.debug('headRefName--->', headRefName);
        util_1.logger.debug('baseRefName--->', baseRefName);
        const { stdout } = await exec(`git fetch && git merge-base --is-ancestor ${baseRefOid} ${headRefOid} && git diff --name-only ${baseRefOid} || git diff --name-only $(git merge-base ${baseRefOid} ${headRefOid})`);
        const diffFiles = stdout.trim().split('\n');
        util_1.logger.debug('command', `git fetch && git merge-base --is-ancestor ${baseRefOid} ${headRefOid} && git diff --name-only ${baseRefOid} || git diff --name-only $(git merge-base ${baseRefOid} ${headRefOid})`);
        util_1.logger.debug('diffFiles', diffFiles);
        const newLabelNames = new Set(diffFiles.reduce((acc, file) => {
            Object.entries(config.rules).forEach(([label, pattern]) => {
                if (ignore_1.default()
                    .add(pattern)
                    .ignores(file)) {
                    acc.push(label);
                }
            });
            return acc;
        }, []));
        util_1.logger.debug('newLabelNames', newLabelNames);
        const ruledLabelNames = new Set(Object.keys(config.rules));
        const labelNamesToAdd = new Set([...newLabelNames].filter(labelName => !currentLabelNames.has(labelName)));
        const labelNamesToRemove = new Set([...currentLabelNames].filter((labelName) => !newLabelNames.has(labelName) && ruledLabelNames.has(labelName)));
        util_1.logger.debug('ruledLabelNames', Array.from(ruledLabelNames));
        util_1.logger.debug('labelNamesToAdd', Array.from(labelNamesToAdd));
        util_1.logger.debug('labelNamesToRemove', Array.from(labelNamesToRemove));
        const labelableId = result.repository.pullRequest.id;
        util_1.logger.debug('labelableId', labelableId);
        if (labelNamesToAdd.size > 0) {
            try {
                await query_1.addLabelsToLabelable(graphqlWithAuth, {
                    labelIds: util_1.getLabelIds(allLabels, [...labelNamesToAdd]),
                    labelableId,
                });
                console.log('Added labels: ', labelNamesToAdd);
            }
            catch (error) {
                util_1.logger.error('Request failed', error.message);
                core.setFailed('addLabelsToLabelable has been failed. ');
            }
        }
        if (labelNamesToRemove.size > 0) {
            try {
                await query_1.removeLabelsFromLabelable(graphqlWithAuth, {
                    labelIds: util_1.getLabelIds(allLabels, [
                        ...labelNamesToRemove,
                    ]),
                    labelableId,
                });
                console.log('Removed labels: ', labelNamesToRemove);
            }
            catch (error) {
                util_1.logger.error('Request failed', error.message);
                core.setFailed('removeLabelsFromLabelable has been failed. ');
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();

});
___scope___.file("util.js", function(exports, require, module, __filename, __dirname){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.getLabelIds = void 0;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const lodash_pick_1 = tslib_1.__importDefault(require("lodash.pick"));
exports.getLabelIds = (allLabels, labelNames) => Object.values(lodash_pick_1.default(allLabels, labelNames));
exports.logger = {
    debug: (message, object) => {
        return core.debug(`${message}: ${JSON.stringify(object)}`);
    },
    error: (message, object) => {
        return core.error(`${message}: ${JSON.stringify(object)}`);
    },
};

});
___scope___.file("query.js", function(exports, require, module, __filename, __dirname){

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeLabelsFromLabelable = exports.addLabelsToLabelable = exports.getPullRequestAndLabels = void 0;
exports.getPullRequestAndLabels = (graphqlWithAuth, { owner, repo, number, }) => {
    const query = `query pullRequestAndLabels($owner: String!, $repo: String!, $number: Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$number) {
        id
        baseRefOid
        headRefOid
        baseRefName
        headRefName
        labels(first: 100) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
      labels(first: 100) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
    rateLimit {
      limit
      cost
      remaining
      resetAt
    }
  }`;
    return graphqlWithAuth(query, {
        owner,
        repo,
        number,
        headers: { Accept: 'application/vnd.github.ocelot-preview+json' },
    });
};
exports.addLabelsToLabelable = (graphqlWithAuth, { labelIds, labelableId, }) => {
    const query = `
    mutation addLabelsToLabelable($labelIds: [ID!]!, $labelableId: ID!) {
      addLabelsToLabelable(input: {labelIds:$labelIds, labelableId:$labelableId}) {
        clientMutationId
      }
    }`;
    return graphqlWithAuth(query, {
        labelIds,
        labelableId,
        headers: { Accept: 'application/vnd.github.starfire-preview+json' },
    });
};
exports.removeLabelsFromLabelable = (graphqlWithAuth, { labelIds, labelableId, }) => {
    const query = `
    mutation removeLabelsFromLabelable($labelIds: [ID!]!, $labelableId: ID!) {
      removeLabelsFromLabelable(input: {labelIds:$labelIds, labelableId:$labelableId}) {
        clientMutationId
      }
    }`;
    return graphqlWithAuth(query, {
        labelIds,
        labelableId,
        headers: { Accept: 'application/vnd.github.starfire-preview+json' },
    });
};

});
return ___scope___.entry = "entrypoint.js";
});

FuseBox.import("default/entrypoint.js");
FuseBox.main("default/entrypoint.js");
})
(function(e){function r(e){var r=e.charCodeAt(0),n=e.charCodeAt(1);if((m||58!==n)&&(r>=97&&r<=122||64===r)){if(64===r){var t=e.split("/"),i=t.splice(2,t.length).join("/");return[t[0]+"/"+t[1],i||void 0]}var o=e.indexOf("/");if(o===-1)return[e];var a=e.substring(0,o),f=e.substring(o+1);return[a,f]}}function n(e){return e.substring(0,e.lastIndexOf("/"))||"./"}function t(){for(var e=[],r=0;r<arguments.length;r++)e[r]=arguments[r];for(var n=[],t=0,i=arguments.length;t<i;t++)n=n.concat(arguments[t].split("/"));for(var o=[],t=0,i=n.length;t<i;t++){var a=n[t];a&&"."!==a&&(".."===a?o.pop():o.push(a))}return""===n[0]&&o.unshift(""),o.join("/")||(o.length?"/":".")}function i(e){var r=e.match(/\.(\w{1,})$/);return r&&r[1]?e:e+".js"}function o(e){if(m){var r,n=document,t=n.getElementsByTagName("head")[0];/\.css$/.test(e)?(r=n.createElement("link"),r.rel="stylesheet",r.type="text/css",r.href=e):(r=n.createElement("script"),r.type="text/javascript",r.src=e,r.async=!0),t.insertBefore(r,t.firstChild)}}function a(e,r){for(var n in e)e.hasOwnProperty(n)&&r(n,e[n])}function f(e){return{server:require(e)}}function u(e,n){var o=n.path||"./",a=n.pkg||"default",u=r(e);if(u&&(o="./",a=u[0],n.v&&n.v[a]&&(a=a+"@"+n.v[a]),e=u[1]),e)if(126===e.charCodeAt(0))e=e.slice(2,e.length),o="./";else if(!m&&(47===e.charCodeAt(0)||58===e.charCodeAt(1)))return f(e);var s=x[a];if(!s){if(m&&"electron"!==_.target)throw"Package not found "+a;return f(a+(e?"/"+e:""))}e=e?e:"./"+s.s.entry;var l,d=t(o,e),c=i(d),p=s.f[c];return!p&&c.indexOf("*")>-1&&(l=c),p||l||(c=t(d,"/","index.js"),p=s.f[c],p||"."!==d||(c=s.s&&s.s.entry||"index.js",p=s.f[c]),p||(c=d+".js",p=s.f[c]),p||(p=s.f[d+".jsx"]),p||(c=d+"/index.jsx",p=s.f[c])),{file:p,wildcard:l,pkgName:a,versions:s.v,filePath:d,validPath:c}}function s(e,r,n){if(void 0===n&&(n={}),!m)return r(/\.(js|json)$/.test(e)?h.require(e):"");if(n&&n.ajaxed===e)return console.error(e,"does not provide a module");var i=new XMLHttpRequest;i.onreadystatechange=function(){if(4==i.readyState)if(200==i.status){var n=i.getResponseHeader("Content-Type"),o=i.responseText;/json/.test(n)?o="module.exports = "+o:/javascript/.test(n)||(o="module.exports = "+JSON.stringify(o));var a=t("./",e);_.dynamic(a,o),r(_.import(e,{ajaxed:e}))}else console.error(e,"not found on request"),r(void 0)},i.open("GET",e,!0),i.send()}function l(e,r){var n=y[e];if(n)for(var t in n){var i=n[t].apply(null,r);if(i===!1)return!1}}function d(e){if(null!==e&&["function","object","array"].indexOf(typeof e)!==-1&&!e.hasOwnProperty("default"))return Object.isFrozen(e)?void(e.default=e):void Object.defineProperty(e,"default",{value:e,writable:!0,enumerable:!1})}function c(e,r){if(void 0===r&&(r={}),58===e.charCodeAt(4)||58===e.charCodeAt(5))return o(e);var t=u(e,r);if(t.server)return t.server;var i=t.file;if(t.wildcard){var a=new RegExp(t.wildcard.replace(/\*/g,"@").replace(/[.?*+^$[\]\\(){}|-]/g,"\\$&").replace(/@@/g,".*").replace(/@/g,"[a-z0-9$_-]+"),"i"),f=x[t.pkgName];if(f){var p={};for(var v in f.f)a.test(v)&&(p[v]=c(t.pkgName+"/"+v));return p}}if(!i){var g="function"==typeof r,y=l("async",[e,r]);if(y===!1)return;return s(e,function(e){return g?r(e):null},r)}var w=t.pkgName;if(i.locals&&i.locals.module)return i.locals.module.exports;var b=i.locals={},j=n(t.validPath);b.exports={},b.module={exports:b.exports},b.require=function(e,r){var n=c(e,{pkg:w,path:j,v:t.versions});return _.sdep&&d(n),n},m||!h.require.main?b.require.main={filename:"./",paths:[]}:b.require.main=h.require.main;var k=[b.module.exports,b.require,b.module,t.validPath,j,w];return l("before-import",k),i.fn.apply(k[0],k),l("after-import",k),b.module.exports}if(e.FuseBox)return e.FuseBox;var p="undefined"!=typeof ServiceWorkerGlobalScope,v="undefined"!=typeof WorkerGlobalScope,m="undefined"!=typeof window&&"undefined"!=typeof window.navigator||v||p,h=m?v||p?{}:window:global;m&&(h.global=v||p?{}:window),e=m&&"undefined"==typeof __fbx__dnm__?e:module.exports;var g=m?v||p?{}:window.__fsbx__=window.__fsbx__||{}:h.$fsbx=h.$fsbx||{};m||(h.require=require);var x=g.p=g.p||{},y=g.e=g.e||{},_=function(){function r(){}return r.global=function(e,r){return void 0===r?h[e]:void(h[e]=r)},r.import=function(e,r){return c(e,r)},r.on=function(e,r){y[e]=y[e]||[],y[e].push(r)},r.exists=function(e){try{var r=u(e,{});return void 0!==r.file}catch(e){return!1}},r.remove=function(e){var r=u(e,{}),n=x[r.pkgName];n&&n.f[r.validPath]&&delete n.f[r.validPath]},r.main=function(e){return this.mainFile=e,r.import(e,{})},r.expose=function(r){var n=function(n){var t=r[n].alias,i=c(r[n].pkg);"*"===t?a(i,function(r,n){return e[r]=n}):"object"==typeof t?a(t,function(r,n){return e[n]=i[r]}):e[t]=i};for(var t in r)n(t)},r.dynamic=function(r,n,t){this.pkg(t&&t.pkg||"default",{},function(t){t.file(r,function(r,t,i,o,a){var f=new Function("__fbx__dnm__","exports","require","module","__filename","__dirname","__root__",n);f(!0,r,t,i,o,a,e)})})},r.flush=function(e){var r=x.default;for(var n in r.f)e&&!e(n)||delete r.f[n].locals},r.pkg=function(e,r,n){if(x[e])return n(x[e].s);var t=x[e]={};return t.f={},t.v=r,t.s={file:function(e,r){return t.f[e]={fn:r}}},n(t.s)},r.addPlugin=function(e){this.plugins.push(e)},r.packages=x,r.isBrowser=m,r.isServer=!m,r.plugins=[],r}();return m||(h.FuseBox=_),e.FuseBox=_}(this))