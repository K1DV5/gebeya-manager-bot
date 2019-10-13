const post = require('./post')
// const edit = require('./edit')
// const settings = require('./settings')
// const convoRoutes = {post, settings, edit}
const convoRoutes = {post}

async function handleText(ctx) {
    console.log(ctx.state.convo)
    let text = ctx.message.text
    if (ctx.state.isAdmin && text.trim()) {
        // get the current conversation
        let convo = ctx.state.convo
        if (!convo) {
            ctx.reply(ctx.state.fallbackReply)
            return
        }
        for (let [about, handler] of Object.entries(convoRoutes)) {
            if (convo.slice(0, about.length + 1) === about + '.') {
                handler(ctx)
                return
            }
        }
    }
    ctx.reply(ctx.state.fallbackReply)
}

module.exports = handleText
