"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useUser } from "@/hooks/useUser";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "../ui/button";
import { useDisconnect } from "wagmi";

function Header() {
  const { user, showOnboarding, completeOnboarding, dismissOnboarding } =
    useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const navItems = [
    { name: "Explore", href: "/explore" },
    { name: "Launch", href: "/launch" },
    { name: "Dex", href: "/dex" },
    { name: "Portfolio", href: "/portfolio" },
  ];
  return (
    <div className="flex items-center justify-between px-20 py-4 border-[#ebe3e8] bg-white border-b">
      <Link href="/" className="flex gap-x-2 cursor-pointer items-center">
        <Image
          src="/logo.png"
          alt="Logo"
          width={56}
          height={28}
          className="h-7 w-14"
          priority
        />
        <p className="font-satoshi text-[#A770FF] text-3xl font-bold">
          Whale.fun
        </p>
      </Link>
      <div className="flex gap-x-8 text-lg font-instrument font-medium items-center">
        {navItems.map((item) => (
          <Link key={item.name} href={item.href} className="transition-colors">
            {item.name}
          </Link>
        ))}
        <div className="relative" ref={menuRef}>
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              authenticationStatus,
              mounted,
            }) => {
              // Note: If your app doesn't use authentication, you
              // can remove all 'authenticationStatus' checks
              const ready = mounted && authenticationStatus !== "loading";
              const connected =
                ready &&
                account &&
                chain &&
                (!authenticationStatus ||
                  authenticationStatus === "authenticated");

              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: {
                      opacity: 0,
                      pointerEvents: "none",
                      userSelect: "none",
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <Button onClick={openConnectModal} type="button">
                          Connect Wallet
                        </Button>
                      );
                    }

                    if (chain.unsupported) {
                      return (
                        <button onClick={openChainModal} type="button">
                          Wrong network
                        </button>
                      );
                    }

                    return (
                      <div style={{ display: "flex", gap: 12 }}>
                        <button
                          onClick={() => setMenuOpen((o) => !o)}
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-label="Open wallet menu"
                          className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium hover:opacity-90 transition flex items-center gap-2"
                        >
                          <span>{account.displayName}</span>
                          <Image
                            src="/icons/wallet.svg"
                            alt="Wallet"
                            width={16}
                            height={16}
                            className="h-4 w-4 opacity-80"
                          />
                        </button>

                        {menuOpen && (
                          <WalletMenu
                            address={account.address as `0x${string}`}
                            displayBalance={account.displayBalance}
                            onCopy={() =>
                              navigator.clipboard.writeText(account.address)
                            }
                            onSwitchNetwork={openChainModal}
                            onClose={() => setMenuOpen(false)}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={dismissOnboarding}
        onComplete={completeOnboarding}
      />
    </div>
  );
}

export default Header;

// Local wallet dropdown component

type WalletMenuProps = {
  address: `0x${string}`;
  displayBalance?: string;
  onCopy: () => void;
  onSwitchNetwork: () => void;
  onClose: () => void;
};

function WalletMenu({
  address,
  displayBalance,
  onCopy,
  onSwitchNetwork,
  onClose,
}: WalletMenuProps) {
  const { disconnect } = useDisconnect();

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return (
    <div
      role="menu"
      className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden"
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Address</span>
          <span className="text-xs text-gray-600 font-mono">{short}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Balance</span>
          <span className="text-sm font-medium">{displayBalance ?? "—"}</span>
        </div>
      </div>
      <div className="border-t border-gray-200" />
      <div className="p-1">
        <button
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          Copy address
        </button>
        <button
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
          onClick={() => {
            onSwitchNetwork();
            onClose();
          }}
        >
          Switch network
        </button>
        <button
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-red-600"
          onClick={() => {
            disconnect();
            onClose();
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
