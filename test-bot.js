const axios = require('axios');

// Your bot token
const botToken = '7674721590:AAFMlMVYvga-QEY-1q_utIFQcrqFuyCaaeI';

// Your group chat ID
const chatId = '-4684806840';

// Message to send
//const message = 'Chào anh Minh em là Trần Hà Linh';

// Function to send message
async function sendMessage(message) {
    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                chat_id: chatId,
                text: message
            }
        );

        console.log('Message sent successfully!');
        console.log('Response:', response.data);
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
}

async function getInfo() {
    try {
        const response = await axios.get(
            `https://api.telegram.org/bot7674721590:AAFMlMVYvga-QEY-1q_utIFQcrqFuyCaaeI/getUpdates`
        );

        console.log('Get info successfully');
        console.log('Response:', response.data.result);
    } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
    }
}

// Call the function
// for (let i = 0; i < 5; i++) {
//     switch (i) {
//         case 0:
//             sendMessage("Chào anh Minh em là Trần Hà Linh");
//             break;
//         case 1:
//             sendMessage("Em khát quá anh ơi");
//             break;
//         case 2:
//             sendMessage("Em sướng quá anh ơi");
//             break;
//         case 3:
//             sendMessage("Mút em đi anh Minhhhhh");
//             break;
//     }
// }
getInfo();