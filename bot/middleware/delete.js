
async function handleDeletePost(ctx) {
    let input = ctx.update.callback_query
    let postAddress = input.data
    let [channel, postId] = postAddress.split('/')
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let query = 'SELECT state FROM posts WHERE channel = ? AND message_id = ?'
    let postExists = (await ctx.state.sql(query, [channel, postId]))[0].state !== 'deleted'
    if (postExists) {
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
        ctx.state.sql('UPDATE posts SET state = "deleted" WHERE channel = ? AND message_id = ?', [channel, postId])
    } else {
        let text = '[deleted] Post not found, may have been alreary deleted'
        ctx.telegram.editMessageCaption(chatId, messageId, undefined, text)
    }
}

module.exports = handleDeletePost
