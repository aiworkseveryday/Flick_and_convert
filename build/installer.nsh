; Remove Flick's Explorer right-click entries when it is uninstalled.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Flick"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Flick"
!macroend
