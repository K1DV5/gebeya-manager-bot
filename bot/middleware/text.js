const post = require('./post')
const edit = require('./edit')
const settings = require('./settings')
const convoRoutes = {post, settings, edit}

async function handleText(ctx) {
    let text = ctx.message.text
    if (ctx.state.isAdmin && text.trim()) {
        // get the current stage
        let stage = ctx.state.stage
        if (!stage) {
            ctx.reply(ctx.state.fallbackReply)
            return
        }
        for (let [about, handler] of Object.entries(convoRoutes)) {
            if (stage.slice(0, about.length + 1) === about + '.') {
                handler(ctx)
                return
            }
        }
    }
    ctx.reply(ctx.state.fallbackReply)
}

module.exports = handleText
