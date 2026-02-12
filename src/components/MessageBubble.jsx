import React from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';

export default function MessageBubble({ message }) {
  const { state } = useAppContext();
  const isSentByMe = message.sender === 'me';
  const animationClass = isSentByMe ? 'slide-in-right' : 'slide-in-left';

  // File transfer bubble
  if (message.fileTransfer) {
    return <FileTransferBubble message={message} isSentByMe={isSentByMe} animationClass={animationClass} />;
  }

  // Text bubble
  const senderUser = isSentByMe ? null : state.allUsers.find(u => u.id === message.sender);
  const myProfilePicture = localStorage.getItem('profilePicture');

  const messageColor = isSentByMe
    ? 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-teal-500/30'
    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700';

  let formattedText = '';
  if (message.text) {
    const escaped = message.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    formattedText = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline text-blue-400 hover:text-blue-300 transition-colors">$1</a>');
  }

  const senderAvatar = !isSentByMe ? (
    senderUser?.profile_picture ? (
      <img src={senderUser.profile_picture} className="w-12 h-12 rounded-full object-cover shadow-lg flex-shrink-0" alt={senderUser.name} />
    ) : (
      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${senderUser?.avatarGradient || 'from-gray-500 to-gray-600'} flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg`}>
        {senderUser?.name?.charAt(0) || '?'}
      </div>
    )
  ) : null;

  const myAvatar = isSentByMe ? (
    myProfilePicture ? (
      <img src={myProfilePicture} className="w-12 h-12 rounded-full object-cover shadow-lg flex-shrink-0" alt="Me" />
    ) : (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg">
        U
      </div>
    )
  ) : null;

  const timestamp = <div className="text-[0.7rem] text-slate-600 dark:text-slate-400 pb-1 flex-shrink-0">{message.time}</div>;

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className={`flex items-end gap-2 max-w-[85%] ${animationClass}`}>
        {!isSentByMe && senderAvatar}
        {isSentByMe && timestamp}
        <div className="flex-1 min-w-0">
          <div className={`px-4 py-1.5 rounded-2xl shadow-lg ${messageColor} ${isSentByMe ? 'rounded-br-lg' : 'rounded-bl-lg'}`}>
            {formattedText && <p className="leading-normal break-words" dangerouslySetInnerHTML={{ __html: formattedText }} />}
          </div>
        </div>
        {!isSentByMe && timestamp}
        {isSentByMe && myAvatar}
      </div>
    </div>
  );
}

function FileTransferBubble({ message, isSentByMe, animationClass }) {
  const ft = message.fileTransfer;
  const fileSizeMb = (ft.fileSize / 1024 / 1024).toFixed(2);

  const handleAccept = () => {
    if (window.acceptFileOffer) window.acceptFileOffer(ft.transferId);
  };
  const handleReject = () => {
    if (window.rejectFileOffer) window.rejectFileOffer(ft.transferId);
  };

  let statusContent;
  switch (ft.status) {
    case 'offered':
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB · <span className="text-teal-600 dark:text-teal-500 font-semibold">Offer Sent</span></p>;
      break;
    case 'incoming':
      statusContent = (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{fileSizeMb} MB · Wants to send you a file.</p>
          <div className="flex gap-2 mt-1">
            <button onClick={handleReject} className="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Decline</button>
            <button onClick={handleAccept} className="flex-1 bg-green-500/20 hover:bg-green-500/40 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300">Accept</button>
          </div>
        </>
      );
      break;
    case 'accepted':
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB · <span className="text-green-600 dark:text-green-500 font-semibold">Accepted, starting transfer...</span></p>;
      break;
    case 'downloading':
      statusContent = (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB</p>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-2">
            <div className="bg-blue-500 dark:bg-blue-600 h-2.5 rounded-full" style={{ width: `${ft.progress || 0}%` }} />
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-500 font-semibold">Downloading... {ft.progress || 0}%</p>
        </>
      );
      break;
    case 'completed':
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB · <span className="text-green-600 dark:text-green-500 font-semibold">Download Complete</span></p>;
      break;
    case 'failed':
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB · <span className="text-red-600 dark:text-red-500 font-semibold">Transfer Failed</span></p>;
      break;
    case 'rejected':
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB · <span className="text-red-600 dark:text-red-500 font-semibold">Offer Rejected</span></p>;
      break;
    default:
      statusContent = <p className="text-sm text-slate-600 dark:text-slate-400">{fileSizeMb} MB</p>;
  }

  const timestamp = <div className="text-[0.7rem] text-slate-600 dark:text-slate-400 pb-1 flex-shrink-0">{message.time}</div>;

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className="flex items-end gap-2 max-w-[85%]">
        {isSentByMe && timestamp}
        <div className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl max-w-sm shadow-md border border-slate-200 dark:border-slate-700 ${animationClass}`}>
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-600 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
            {utils.getFileIcon(ft.fileType || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{ft.fileName}</p>
            {statusContent}
          </div>
        </div>
        {!isSentByMe && timestamp}
      </div>
    </div>
  );
}
