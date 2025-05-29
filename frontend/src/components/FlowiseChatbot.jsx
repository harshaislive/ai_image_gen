import { useRef, useState } from "react";

export default function FlowiseChatbot() {
  const [open, setOpen] = useState(false);
  const scriptLoaded = useRef(false);

  const handleOpen = () => {
    setOpen(true);
    // Only inject script once
    if (!scriptLoaded.current) {
      const script = document.createElement("script");
      script.type = "module";
      script.innerHTML = `
        import Chatbot from "https://cdn.jsdelivr.net/npm/flowise-embed/dist/web.js";
        Chatbot.init({
          chatflowid: "12025a0e-8c9b-473c-9e37-08f6a6bbbf17",
          apiHost: "https://flowiseaiflowise-production-431d.up.railway.app",
          chatflowConfig: {},
          observersConfig: {},
          theme: ${JSON.stringify({
          fontFamily: "'ABC Arizona Sans', 'ABC Arizona Flare Regular', Arial, sans-serif",
          button: {
            backgroundColor: '#344736',
            iconColor: '#fdfbf7',
            right: 20,
            bottom: 20,
            size: 48,
            dragAndDrop: true,
            customIconSrc: '/chat_icon.jpg',
            autoWindowOpen: {
              autoOpen: false,
              openDelay: 0,
              autoOpenOnMobile: false
            }
          },
          tooltip: {
            showTooltip: true,
            tooltipMessage: 'Let\'s create some prompts',
            tooltipBackgroundColor: '#342e29',
            tooltipTextColor: '#fdfbf7',
            tooltipFontSize: 16
          },
          disclaimer: {
            title: 'Disclaimer',
            message: "By using this chatbot, you agree to the <a target=\"_blank\" href=\"https://flowiseai.com/terms\">Terms & Condition</a>",
            textColor: '#342e29',
            buttonColor: '#002140',
            buttonText: 'Start Chatting',
            buttonTextColor: '#fdfbf7',
            blurredBackgroundColor: 'rgba(52, 46, 41, 0.4)',
            backgroundColor: '#fdfbf7'
          },
          customCSS: `
  .flowise-launcher-button img {
    background: #b0ddf1 !important;
    border-radius: 50% !important;
    padding: 6px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border: 2px solid #e7e4df;
    width: 36px !important;
    height: 36px !important;
    object-fit: contain;
  }
  .flowise-chatbot-title img {
    background: #b0ddf1 !important;
    border-radius: 50% !important;
    padding: 4px !important;
    border: 2px solid #e7e4df;
    width: 32px !important;
    height: 32px !important;
    object-fit: contain;
  }
    background: #b0ddf1 !important;
    border-radius: 50% !important;
    padding: 6px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    border: 2px solid #e7e4df;
    width: 36px !important;
    height: 36px !important;
    object-fit: contain;
  }
  .flowise-chatbot-message.bot {
    background: #b0ddf1 !important;
    color: #342e29 !important;
  }
  .flowise-chatbot-window {
    max-height: 80vh !important;
    overflow-y: auto !important;
    margin-top: 24px !important;
  }
  .flowise-chatbot-message.user {
    background: #ffc083 !important;
    color: #342e29 !important;
  }
  .flowise-chatbot-title {
    color: #342e29 !important;
    background: #fdfbf7 !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 10 !important;
  }
  .flowise-chatbot-message a {
    color: #002140 !important;
    text-decoration: underline !important;
  }
`,


          chatWindow: {
            titleColor: '#342e29',
            showTitle: true,
            showAgentMessages: true,
            title: 'Flowise Bot',
            titleAvatarSrc: '/chat_icon.jpg',
            welcomeMessage: `To generate your ad-creative design prompts, please provide the following assets:\n\n• The masked image to fill the poster\n• The masked image showing where painting should happen\n• The exact text (headline, subhead, CTA)\n• An example of the desired font style\n\nOnce you provide these, I will generate detailed prompts for you.`,
            errorMessage: 'This is a custom error message',
            
            backgroundImage: '',
            height: 400, // smaller height
            width: 320,
            maxHeight: '80vh', // responsive max height
            fontSize: 16,
            starterPrompts: [
              "What is a bot?",
              "Who are you?"
            ],
            starterPromptFontSize: 15,
            clearChatOnReload: false,
            sourceDocsTitle: 'Sources:',
            renderHTML: true,
            botMessage: {
              backgroundColor: '#b0ddf1',
              textColor: '#342e29',
              showAvatar: true,
              avatarSrc: '/9922879.png'
            },
            userMessage: {
              backgroundColor: '#ffc083',
              textColor: '#342e29',
              showAvatar: true,
              avatarSrc: 'https://raw.githubusercontent.com/zahidkhawaja/langchain-chat-nextjs/main/public/usericon.png'
            },
            textInput: {
              placeholder: 'Type your question',
               
               
              sendButtonColor: '#002140', 
              maxChars: 50,
              maxCharsWarningMessage: 'You exceeded the characters limit. Please input less than 50 characters.',
              autoFocus: true,
              sendMessageSound: true,
              sendSoundLocation: 'send_message.mp3',
              receiveMessageSound: true,
              receiveSoundLocation: 'receive_message.mp3'
            },
            feedback: {
              color: '#344736'
            },
            dateTimeToggle: {
              date: true,
              time: true
            },
            footer: {
              textColor: '#303235',
              text: 'Powered by',
              company: 'Flowise',
              companyLink: 'https://flowiseai.com'
            }
          }
        })}
      });
    `;
    document.body.appendChild(script);
    scriptLoaded.current = true;
  }
};

  // Hide chatbot if not open (Flowise opens window via script)
  // Show chat button if not open
  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            background: '#344736',
            color: '#fff',
            borderRadius: '50%',
            width: 56,
            height: 56,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            cursor: 'pointer',
          }}
          aria-label="Open chatbot"
        >
          💬
        </button>
      )}
    </>
  );
}