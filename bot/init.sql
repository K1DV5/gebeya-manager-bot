/* DROP TABLE posts; */
/* DROP TABLE sessions; */

/* admins of channels */
CREATE TABLE admins (username VARCHAR(255) PRIMARY KEY);

/* channels owned by admins, an admin can have more than one channel */
CREATE TABLE channels (username VARCHAR(255) PRIMARY KEY,
                       admin VARCHAR(255),
                       FOREIGN KEY (admin) REFERENCES admins(username)
);

/* posts are assumed to be by the bot,
 message_id is in the form '@channel/message_id' because message_id's are only unique inside chats */
CREATE TABLE posts (message_id VARCHAR(255) PRIMARY KEY,
                    channel VARCHAR(255),
                    title VARCHAR(255),
                    description VARCHAR(2048),
                    images_json VARCHAR(3000),
                    image_posted VARCHAR(255),
                    image_posted_local VARCHAR(255),
                    FOREIGN KEY (channel) REFERENCES channels(username)
);

/* sessions store where someone is within the conversation, and stage is 0 based */
CREATE TABLE sessions (user_id VARCHAR(255) PRIMARY KEY,
                       chat_type VARCHAR(255) DEFAULT 'customer',  # customer or admin
                       channel VARCHAR(255),
                       stage VARCHAR(255),
                       FOREIGN KEY (channel) REFERENCES channels(username)
);
