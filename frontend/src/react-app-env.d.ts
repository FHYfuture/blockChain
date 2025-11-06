/// <reference types="react-scripts" />

// 添加这个来识别 MetaMask 注入的 provider
interface Window {
  ethereum: any;
}