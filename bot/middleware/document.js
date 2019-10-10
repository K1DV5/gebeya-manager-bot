
async function handleDocument(ctx) {
    let username = ctx.from.username
    let people = (await ctx.state.sql('SELECT username FROM people')).map(p => p.username)
    if (people.includes(username)) {
        // get the current stage
        let stage = (await ctx.state.sql('SELECT conversation FROM people WHERE username = ?', [username]))[0].conversation
        if (stage === 'settings.logo.document') {
            let doc = ctx.update.message.document
            let [type, ext] = doc.mime_type.split('/')
            if (type === 'image') {
                let docProps = await ctx.telegram.getFile(ctx.update.message.document.file_id)
                let documentUrl = `https://api.telegram.org/file/bot${ctx.state.token}/${docProps.file_path}`
                let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
                let filePath = path.join(ctx.state.imagesDir, username, 'logo-' + channel + '.' + ext)
                photo.downloadFile(documentUrl, filePath)
                ctx.reply('Done, this change will take effect the next time you post an item on @' + channel + '.')
            } else {
                ctx.reply('This is not an image. Send an image file.')
            }
        } else {
            ctx.reply(ctx.state.fallbackReply)
        }
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

