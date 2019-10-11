const post = require('./post')
const settings = require('./settings')
const edit = require('./edit')
const details = require('./details')
const sold = require('./sold')
const repost = require('./repost')
const del = require('./delete')

function handleCallback(ctx) {
    let callbackData = ctx.update.callback_query.data
    let prefixes = {
        'post:': (ctx) => {ctx.state.stage = 'post.post'; post(ctx)},
        'discard:': ctx => {ctx.state.stage = 'post.discard'; post(ctx)},
        'details:': details, // buyer
        'sold:': sold,
        'repost:': repost,
        'edit:': ctx => {ctx.state.stage = null; edit(ctx)},
        'edit.after:': edit, // after some changs are made, save or discard
        'delete:': del,
        'settings:': settings,
    }
    for (let [prefix, handler] of Object.entries(prefixes)) {
        if (callbackData.slice(0, prefix.length) === prefix) {
            // remove the prefix
            ctx.update.callback_query.data = callbackData.slice(prefix.length)
            handler(ctx)
            break
        }
    }
    ctx.answerCbQuery('Done')
}

module.exports = handleCallback
