import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import * as utils from '../utils';
import { useProfilePictureBlobUrl } from '../hooks/useProfilePictureBlobUrl';

function MessageBubble({ message }) {
  const { state } = useAppContext();
  const isSentByMe = message.sender === 'me';
  const animClass = isSentByMe ? 'slide-in-right' : 'slide-in-left';

  // Determine delivery status icon
  const getStatusIcon = () => {
    if (!isSentByMe) return null;

    // Read (double tick blue)
    if (message.read) {
      return (
        <span className="text-cyan-400 text-xs font-bold" title="Read">
          ✓✓
        </span>
      );
    }

    // Delivered (single tick gray)
    if (message.delivered) {
      return (
        <span className="text-slate-400 text-xs font-bold" title="Delivered">
          ✓
        </span>
      );
    }

    // Offline (clock icon)
    return (
      <span className="text-slate-500 text-xs" title="Pending (recipient offline)">
        🕐
      </span>
    );
  };

  if (message.fileTransfer) {
    return <FileTransferBubble message={message} isSentByMe={isSentByMe} animClass={animClass} />;
  }

  const senderUser = useMemo(() =>
    isSentByMe ? null : state.allUsers.find(u => u.id === message.sender),
    [isSentByMe, message.sender, state.allUsers]
  );
  // Get current user's profile picture from Redux state (same as settings area)
  const currentUserData = isSentByMe ? state.allUsers.find(u => u.username === state.currentUser?.username) : null;

  // Use blob URL for current user's profile picture
  const { blobUrl: myProfilePicture } = useProfilePictureBlobUrl(
    currentUserData?.username,
    currentUserData?.profile_picture,
    currentUserData?.profile_picture_timestamp
  );

  // Use blob URL for sender's profile picture
  const { blobUrl: senderProfilePicture } = useProfilePictureBlobUrl(
    senderUser?.id || senderUser?.username,
    senderUser?.profile_picture,
    senderUser?.profile_picture_timestamp
  );

  if (isSentByMe && !myProfilePicture) {
    console.warn('⚠️ MyProfilePicture is null/empty', {
      currentUser: state.currentUser?.username,
      currentUserData,
      allUsersCount: state.allUsers.length,
      allUsers: state.allUsers.map(u => ({ username: u.username, hasPic: !!u.profile_picture }))
    });
  }

  // Glass message style
  const sentStyle = 'bg-gradient-to-br from-teal-500/90 to-cyan-600/90 text-white shadow-lg shadow-teal-500/15';
  const receivedStyle = 'bg-white/50 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-white/30 dark:border-white/10 shadow-lg';
  const messageColor = isSentByMe ? sentStyle : receivedStyle;
  const timestampColor = isSentByMe ? 'text-cyan-50/70' : 'text-slate-500 dark:text-slate-400';

  let formattedText = '';
  if (message.text) {
    const escaped = message.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    formattedText = escaped.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline text-blue-300 hover:text-blue-200 transition-colors">$1</a>');
  }

  const senderAvatar = !isSentByMe ? (
    senderProfilePicture ? (
      <img src={senderProfilePicture} className="w-12 !h-12 rounded-full object-cover shadow-md ring-2 ring-white/20 flex-shrink-0" alt={senderUser.name} />
    ) : (
      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${senderUser?.avatarGradient || 'from-gray-500 to-gray-600'} flex items-center justify-center font-bold text-white text-base flex-shrink-0 shadow-md ring-2 ring-white/20`}>
        {senderUser?.name?.charAt(0) || '?'}
      </div>
    )
  ) : null;

  const myAvatar = isSentByMe ? (
    myProfilePicture ? (
      <img src={myProfilePicture} className="w-12 !h-12 rounded-full object-cover shadow-md ring-2 ring-white/20 flex-shrink-0" alt="Me" />
    ) : (
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-base flex-shrink-0 shadow-md ring-2 ring-white/20">U</div>
    )
  ) : null;

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className={`flex items-end gap-2 max-w-[80%]`} style={{ willChange: 'transform' }}>
        {!isSentByMe && senderAvatar}
        <div className="flex-1 min-w-0">
          <div className={`px-4 py-2 ${isSentByMe ? 'pr-24' : 'pr-16'} relative rounded-2xl ${messageColor} ${isSentByMe ? 'rounded-br-md' : 'rounded-bl-md'} transition-all duration-300 hover:shadow-xl`}>
            {formattedText && (
              <div className="leading-relaxed break-words text-[13px] whitespace-pre-wrap">
                <span dangerouslySetInnerHTML={{ __html: formattedText }} />
              </div>
            )}
            <div className={`absolute bottom-2 right-3 text-[9px] font-mono leading-none ${timestampColor} flex items-center gap-1.5 whitespace-nowrap`}>
              <span>{message.time}</span>
              {getStatusIcon()}
            </div>
          </div>
        </div>
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

  return (
    <div className={`message-bubble flex w-full ${isSentByMe ? 'justify-end' : 'justify-start'} my-1`}>
      <div className="flex items-end gap-2 max-w-[85%]">
        <div className={`flex items-center gap-3 p-3.5 pb-6 relative glass-panel rounded-2xl max-w-sm hover:shadow-xl transition-all duration-300 ${animClass}`}>
          <div className="w-11 h-11 bg-gradient-to-br from-slate-100/50 to-slate-200/30 dark:from-slate-700/30 dark:to-slate-600/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 backdrop-blur-sm">
            {utils.getFileIcon(ft.fileType || '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{ft.fileName}</p>
            {statusContent}
          </div>
          <div className={`absolute bottom-1.5 right-3 text-[9px] font-mono leading-none text-slate-500 dark:text-slate-400`}>
             {message.time}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(MessageBubble);
