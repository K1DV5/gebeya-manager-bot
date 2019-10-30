const {deleteMessage} = require('./notify')

async function handleCancel(ctx) {
    let username = ctx.from.username
    let convo = await ctx.people.getConvo(username)
    if (convo) {
        let removed = JSON.parse(await ctx.people.get(username, 'removed_message_ids'))
        let chatId = ctx.update.message.chat.id
        if (removed !== null && removed.length) {
            await Promise.all(removed.map(async id => {
                await deleteMessage(ctx, chatId, id)
            }))
        }
        let about = convo.split('.', 1)[0]
        await ctx.people.clearDraft(username)
        await ctx.reply(about[0].toUpperCase() + about.slice(1) + ' cancelled.')
    } else {
        await ctx.reply('You aren\'t doing anything.')
    }
}

module.exports = {handleCancel}
