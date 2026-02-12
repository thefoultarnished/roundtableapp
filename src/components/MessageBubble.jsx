import React from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';

export default function MessageBubble({ message }) {
  const { state } = useAppContext();
  const isSentByMe = message.sender === 'me';
  const animClass = isSentByMe ? 'slide-in-right' : 'slide-in-left';

  if (message.fileTransfer) {
    return <FileTransferBubble message={message} isSentByMe={isSentByMe} animClass={animClass} />;
  }

  const senderUser = isSentByMe ? null : state.allUsers.find(u => u.id === message.sender);
  const myProfilePicture = localStorage.getItem('profilePicture');

  // Glass message style
  const sentStyle = 'bg-gradient-to-br from-teal-500/90 to-cyan-600/90 text-white shadow-lg shadow-teal-500/15 backdrop-blur-sm';
  const receivedStyle = 'bg-white/50 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-white/30 dark:border-white/10 shadow-lg backdrop-blur-md';
  const messageColor = isSentByMe ? sentStyle : receivedStyle;

  let formattedText = '';
  if (message.text) {
    const escaped = message.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    formattedText = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline text-blue-300 hover:text-blue-200 transition-colors">$1</a>');
  }

  const senderAvatar = !isSentByMe ? (
    senderUser?.profile_picture ? (
      <img src={senderUser.profile_picture} className="w-9 h-9 rounded-full object-cover shadow-md ring-2 ring-white/20 flex-shrink-0" alt={senderUser.name} />
    ) : (
      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${senderUser?.avatarGradient || 'from-gray-500 to-gray-600'} flex items-center justify-center font-bold text-white text-sm flex-shrink-0 shadow-md ring-2 ring-white/20`}>
        {senderUser?.name?.charAt(0) || '?'}
      </div>
    )
  ) : null;

  const myAvatar = isSentByMe ? (
    myProfilePicture ? (
      <img src={myProfilePicture} className="w-9 h-9 rounded-full object-cover shadow-md ring-2 ring-white/20 flex-shrink-0" alt="Me" />
    ) : (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 shadow-md ring-2 ring-white/20">U</div>
    )
  ) : null;

  const ts = (
    <div className="text-[10px] text-slate-400/70 dark:text-slate-500/70 pb-1 flex-shrink-0 font-mono">
      {message.time}
    </div>
  );

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className={`flex items-end gap-2 max-w-[80%] ${animClass}`}>
        {!isSentByMe && senderAvatar}
        {isSentByMe && ts}
        <div className="flex-1 min-w-0">
          <div className={`px-4 py-2 rounded-2xl ${messageColor} ${isSentByMe ? 'rounded-br-md' : 'rounded-bl-md'} transition-all duration-300 hover:shadow-xl`}>
            {formattedText && <p className="leading-relaxed break-words text-[13px]" dangerouslySetInnerHTML={{ __html: formattedText }} />}
          </div>
        </div>
        {!isSentByMe && ts}
        {isSentByMe && myAvatar}
      </div>
    </div>
  );
}

function FileTransferBubble({ message, isSentByMe, animClass }) {
  const ft = message.fileTransfer;
  const fileSizeMb = (ft.fileSize / 1024 / 1024).toFixed(2);

  const handleAccept = () => window.acceptFileOffer?.(ft.transferId);
  const handleReject = () => window.rejectFileOffer?.(ft.transferId);

  let statusContent;
  switch (ft.status) {
    case 'offered':
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB · <span className="text-teal-500 font-semibold">Offer Sent</span></p>;
      break;
    case 'incoming':
      statusContent = (
        <>
          <p className="text-xs text-slate-500 mb-2">{fileSizeMb} MB · Wants to send you a file.</p>
          <div className="flex gap-2 mt-1">
            <button onClick={handleReject} className="flex-1 glass-panel hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300">Decline</button>
            <button onClick={handleAccept} className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/30">Accept</button>
          </div>
        </>
      );
      break;
    case 'accepted':
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB · <span className="text-emerald-500 font-semibold">Starting transfer...</span></p>;
      break;
    case 'downloading':
      statusContent = (
        <>
          <p className="text-xs text-slate-500 mb-1">{fileSizeMb} MB</p>
          <div className="w-full bg-white/20 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-teal-400 to-cyan-400 h-full rounded-full transition-all duration-500 relative overflow-hidden" style={{ width: `${ft.progress || 0}%` }}>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ animation: 'shimmerSlide 1.5s infinite' }} />
            </div>
          </div>
          <p className="text-[10px] text-cyan-500 font-semibold mt-1">{ft.progress || 0}%</p>
        </>
      );
      break;
    case 'completed':
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB · <span className="text-emerald-500 font-semibold">✓ Complete</span></p>;
      break;
    case 'failed':
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB · <span className="text-red-400 font-semibold">✗ Failed</span></p>;
      break;
    case 'rejected':
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB · <span className="text-red-400 font-semibold">Declined</span></p>;
      break;
    default:
      statusContent = <p className="text-xs text-slate-500">{fileSizeMb} MB</p>;
  }

  const ts = <div className="text-[10px] text-slate-400/70 pb-1 flex-shrink-0 font-mono">{message.time}</div>;

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className="flex items-end gap-2 max-w-[85%]">
        {isSentByMe && ts}
        <div className={`flex items-center gap-3 p-3.5 glass-panel rounded-2xl max-w-sm hover:shadow-xl transition-all duration-300 ${animClass}`}>
          <div className="w-11 h-11 bg-gradient-to-br from-slate-100/50 to-slate-200/30 dark:from-slate-700/30 dark:to-slate-600/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 backdrop-blur-sm">
            {utils.getFileIcon(ft.fileType || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{ft.fileName}</p>
            {statusContent}
          </div>
        </div>
        {!isSentByMe && ts}
      </div>
    </div>
  );
}
