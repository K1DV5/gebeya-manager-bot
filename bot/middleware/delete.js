
async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let messageIdDb = input.data
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let query = 'SELECT state FROM posts WHERE message_id = ?'
    let postExists = (await ctx.state.sql(query, [messageIdDb]))[0].state !== 'deleted'
    if (postExists) {
        let [channel, postId] = messageIdDb.split('/')
        try {
            ctx.telegram.deleteMessage('@' + channel, postId)
            let text = 'Post deleted.'
            ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
        } catch {
            ctx.state.forceSold = true // force make it sold
            handleSoldToggle(ctx)
            let text = "can't delete message, marked sold. You can delete it manually."
            ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
        }
        ctx.state.sql('UPDATE posts SET state = "deleted" WHERE message_id = ?', [messageIdDb])
    } else {
        let text = '[deleted] Post not found, may have been alreary deleted'
        ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
    }
}

module.exports = handleDeletePost
