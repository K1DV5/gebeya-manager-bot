const {downloadFile} = require('../utils')
const path = require('path')

async function handleDocument(ctx) {
    if (ctx.state.stage === 'settings.logo.document') {
        let username = ctx.from.username
        let doc = ctx.update.message.document
        let [type, ext] = doc.mime_type.split('/')
        if (type === 'image') {
            try {
                let docProps = await ctx.telegram.getFile(ctx.update.message.document.file_id)
                let documentUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${docProps.file_path}`
                let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
                let filePath = path.join(ctx.state.imagesDir, username, 'logo-' + channel + '.' + ext)
                await downloadFile(documentUrl, filePath)
                ctx.reply('Done, this change will take effect the next time you post an item on @' + channel + '.')
                ctx.state.sql('UPDATE people SET conversation = NULL WHERE username = ?', [username])
            } catch(err) {
                if (err.code === 'ECONNREFUSED') {
                    ctx.reply('Sorry, a connection problem occured. Send it again.')
                } else {
                    throw err
                }
            }
        } else {
            ctx.reply('This is not an image. Send an image file.')
        }
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

module.exports = handleDocument
