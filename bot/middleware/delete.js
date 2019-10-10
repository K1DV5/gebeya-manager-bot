
async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let query = 'SELECT 1 FROM posts WHERE message_id = ?'
    let postExists = (await ctx.state.sql(query, [messageIdDb]))[0]
    if (postExists) {
        let [channel, postId] = messageIdDb.split('/')
        let chatId = ctx.update.callback_query.from.id
        let messageId = ctx.update.callback_query.message.message_id
        try {
            ctx.telegram.deleteMessage('@' + channel, postId)
            let text = 'Post deleted.'
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
        } catch {
            ctx.state.forceSold = true // force make it sold
            handleSoldToggle(ctx)
            let text = "can't delete message, marked sold. You can delete it manually."
            ctx.telegram.editMessageText(chatId, messageId, undefined, text)
        }
    } else {
        ctx.reply('Sorry, not found')
    }
}

module.exports = handleDeletePost
