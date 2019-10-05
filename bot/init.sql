/* DATA MODEL FOR THE BOT */

/* admins of channels */
CREATE TABLE admins (username VARCHAR(255) PRIMARY KEY,
                     chat_id VARCHAR(255),
                     draft_title VARCHAR(255),
                     draft_description VARCHAR(3000),
                     /* json encoded list of image ids, the first is the collage */
                     draft_image_ids VARCHAR(3000),
                     draft_stage VARCHAR(255), /* where the admin is in the publishing of the post */
                     caption_template VARCHAR(1024) DEFAULT ':title\n\n:description'
);

/* channels owned by admins, an admin can have more than one channel */
CREATE TABLE channels (username VARCHAR(255) PRIMARY KEY,
                       admin VARCHAR(255),
                       contact_text VARCHAR(255),
                       FOREIGN KEY (admin) REFERENCES admins(username)
);

/* posts by the bot,
 message_id is in the form 'channel/message_id' because message_id's are only unique inside chats */
CREATE TABLE posts (message_id VARCHAR(255) PRIMARY KEY,
                    channel VARCHAR(255),
                    caption VARCHAR(3000),
                    /* json encoded list of image ids, the first is the collage */
                    image_ids VARCHAR(3000),
                    FOREIGN KEY (channel) REFERENCES channels(username)
);
