import React, { useState, useEffect } from 'react';
import { 
  createCampaignTx, 
  contributeTx, 
  withdrawTx, 
  refundTx, 
  listCampaigns, 
  getCampaignStatus, 
  getTokenBalance, 
  mintTokensTx,
  calculateProgress,
  validateCampaignInputs,
  FACTORY_ADDRESS,
  TOKEN_ADDRESS,
  getContractEvents,
  kit,
  type CampaignStatus,
  type DecodedEvent
} from './utils/stellar';

// Mock Constants for Sandbox Simulation
const MOCK_CREATOR = 'GDDS2CREATOR...MOCK';

export default function App() {
  // Wallet state
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [userAddress, setUserAddress] = useState<string>('');
  const [nativeBalance, setNativeBalance] = useState<string>('0');
  const [tokenBalance, setTokenBalance] = useState<string>('0');
  const [isSandbox, setIsSandbox] = useState<boolean>(false);
  
  // Campaigns list state
  const factoryAddress = FACTORY_ADDRESS || 'CD3XTRCKMI6DFJ4E76T7SNQ6RCEI6LLJMLHXVFOA7JQ4V2TZRCSCKRGB';
  const [campaigns, setCampaigns] = useState<CampaignStatus[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);
  const [recentEvents, setRecentEvents] = useState<DecodedEvent[]>([]);
  
  // Create Campaign Form state
  const [goal, setGoal] = useState<string>('1000');
  const [durationSecs, setDurationSecs] = useState<string>('3600');
  const [metadataUri, setMetadataUri] = useState<string>('ipfs://save-the-ocean-ecosystem');
  
  // Contribution Form state
  const [contributionAmounts, setContributionAmounts] = useState<{ [contractAddr: string]: string }>({});
  
  // Transaction Progress state
  const [txStatus, setTxStatus] = useState<string>('idle'); // idle, building, awaiting signature, submitting, confirming, success, error
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | undefined>(undefined);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'success' | 'failed'>('all');

  // Trigger ticker updates
  const [_tick, setTick] = useState<number>(0);

  // Poll ticks for countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize and load campaigns
  useEffect(() => {
    if (isSandbox) {
      loadSandboxCampaigns();
    } else {
      loadRealCampaigns();
    }
  }, [isSandbox, factoryAddress]);

  // Periodic polling for events and balances
  useEffect(() => {
    if (!walletConnected || !userAddress) return;
    
    const pollInterval = setInterval(() => {
      refreshBalances();
      if (!isSandbox) {
        pollRealEvents();
      }
    }, 8000);

    return () => clearInterval(pollInterval);
  }, [walletConnected, userAddress, isSandbox]);

  // Load Real Campaigns from Soroban
  const loadRealCampaigns = async () => {
    if (!factoryAddress || factoryAddress.startsWith('C') === false) return;
    setLoadingCampaigns(true);
    try {
      const addresses = await listCampaigns();
      const loaded: CampaignStatus[] = [];
      for (const addr of addresses) {
        const status = await getCampaignStatus(addr);
        if (status) {
          loaded.push(status);
        }
      }
      setCampaigns(loaded);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Load Initial Mock Campaigns for Sandbox
  const loadSandboxCampaigns = () => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const mockList: CampaignStatus[] = [
      {
        contractAddress: 'CCAMP_MOCK_SAVE_THE_OCEAN',
        creator: MOCK_CREATOR,
        token: TOKEN_ADDRESS,
        goal: 5000n,
        deadline: now + 600n, // 10 minutes remaining
        raised: 3200n,
        goalMet: false,
        ended: false,
        metadataUri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80'
      },
      {
        contractAddress: 'CCAMP_MOCK_SOLAR_POWER_KITS',
        creator: MOCK_CREATOR,
        token: TOKEN_ADDRESS,
        goal: 10000n,
        deadline: now + 7200n, // 2 hours remaining
        raised: 12000n,
        goalMet: true,
        ended: false,
        metadataUri: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=500&auto=format&fit=crop&q=80'
      },
      {
        contractAddress: 'CCAMP_MOCK_OLD_LIBRARY_BOOKS',
        creator: MOCK_CREATOR,
        token: TOKEN_ADDRESS,
        goal: 2500n,
        deadline: now - 30n, // Expired
        raised: 1500n,
        goalMet: false,
        ended: false,
        metadataUri: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=500&auto=format&fit=crop&q=80'
      }
    ];
    setCampaigns(mockList);
  };

  // Refresh balances
  const refreshBalances = async () => {
    if (!userAddress) return;
    if (isSandbox) {
      const cached = localStorage.getItem(`sandbox_bal_${userAddress}`);
      setTokenBalance(cached || '10000');
      setNativeBalance('150');
    } else {
      try {
        const bal = await getTokenBalance(TOKEN_ADDRESS, userAddress);
        setTokenBalance(bal.toString());
        setNativeBalance('84.2'); // Standard static placeholder for Native XLM fees
      } catch (err) {
        console.error('Balance check failed:', err);
      }
    }
  };

  // Poll Real Events
  const pollRealEvents = async () => {
    if (!factoryAddress) return;
    try {
      const factoryEvents = await getContractEvents(factoryAddress);
      setRecentEvents(factoryEvents);
    } catch (err) {
      console.error('Error polling events:', err);
    }
  };

  // Connect Wallet Action
  const handleConnectWallet = async (type: 'freighter' | 'sandbox') => {
    if (type === 'sandbox') {
      setIsSandbox(true);
      const randAddr = 'G' + Math.random().toString(36).substring(2, 15).toUpperCase() + 'SANDBOX';
      setUserAddress(randAddr);
      setWalletConnected(true);
      localStorage.setItem(`sandbox_bal_${randAddr}`, '10000');
      setTokenBalance('10000');
      setNativeBalance('150');
      
      const mockEvent: DecodedEvent = {
        id: 'evt_sandbox_init',
        type: 'campaign_created',
        contractId: 'SANDBOX',
        ledger: '1',
        topics: ['Sandbox Connected', randAddr],
        value: 'Sandbox Mode Active',
        timestamp: Date.now()
      };
      setRecentEvents([mockEvent]);
    } else {
      setIsSandbox(false);
      try {
        setTxStatus('building');
        const { address } = await kit.getAddress();
        setUserAddress(address);
        setWalletConnected(true);
        setTxStatus('idle');
        
        const factoryEvents = await getContractEvents(factoryAddress);
        setRecentEvents(factoryEvents);
      } catch (err: any) {
        setTxStatus('error');
        setTxError(err.message || 'Freighter connection failed');
      }
    }
  };

  // Disconnect Wallet
  const handleDisconnect = () => {
    setWalletConnected(false);
    setUserAddress('');
    setNativeBalance('0');
    setTokenBalance('0');
  };

  // Mint Tokens (Testnet Faucet)
  const handleMintTokens = async () => {
    if (isSandbox) {
      setTxStatus('building');
      setTimeout(() => {
        setTxStatus('success');
        const newBal = (BigInt(tokenBalance) + 500n).toString();
        setTokenBalance(newBal);
        localStorage.setItem(`sandbox_bal_${userAddress}`, newBal);
        
        const mockEvt: DecodedEvent = {
          id: `evt_mint_${Date.now()}`,
          type: 'contribution',
          contractId: TOKEN_ADDRESS,
          ledger: '99',
          topics: ['token_mint', userAddress],
          value: '500 Tokens Faucet Minted',
          timestamp: Date.now()
        };
        setRecentEvents((prev) => [mockEvt, ...prev]);
      }, 1000);
    } else {
      try {
        setTxError(undefined);
        await mintTokensTx(userAddress, '500', (status, hash, err) => {
          setTxStatus(status);
          setTxHash(hash);
          if (err) setTxError(err);
        });
        await refreshBalances();
      } catch (err) {
        console.error('Minting failed:', err);
      }
    }
  };

  // Create Campaign Submit
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form Input Validation
    const validation = validateCampaignInputs(goal, durationSecs, metadataUri);
    if (!validation.valid) {
      setTxStatus('error');
      setTxError(validation.error);
      return;
    }

    if (isSandbox) {
      setTxStatus('building');
      setTimeout(() => {
        setTxStatus('success');
        const now = BigInt(Math.floor(Date.now() / 1000));
        const newCampaign: CampaignStatus = {
          contractAddress: `CCAMP_MOCK_${Date.now()}`,
          creator: userAddress,
          token: TOKEN_ADDRESS,
          goal: BigInt(goal),
          deadline: now + BigInt(durationSecs),
          raised: 0n,
          goalMet: false,
          ended: false,
          metadataUri
        };
        setCampaigns((prev) => [newCampaign, ...prev]);
        
        const mockEvt: DecodedEvent = {
          id: `evt_camp_${Date.now()}`,
          type: 'campaign_created',
          contractId: newCampaign.contractAddress,
          ledger: '100',
          topics: ['campaign_created', userAddress],
          value: `Goal: ${goal} Tokens - ${metadataUri}`,
          timestamp: Date.now()
        };
        setRecentEvents((prev) => [mockEvt, ...prev]);
      }, 1200);
    } else {
      try {
        setTxError(undefined);
        await createCampaignTx(
          userAddress,
          goal,
          Number(durationSecs),
          metadataUri,
          (status, hash, err) => {
            setTxStatus(status);
            setTxHash(hash);
            if (err) setTxError(err);
          }
        );
        await loadRealCampaigns();
      } catch (err: any) {
        console.error('Create campaign transaction failed:', err);
        setTxStatus('error');
        setTxError(err.message || 'Create campaign failed');
      }
    }
  };

  // Contribute to Campaign
  const handleContribute = async (campaignAddress: string) => {
    const amount = contributionAmounts[campaignAddress] || '';
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setTxStatus('error');
      setTxError('Please enter a positive contribution amount');
      return;
    }

    const campaign = campaigns.find(c => c.contractAddress === campaignAddress);
    if (campaign) {
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (now >= campaign.deadline) {
        setTxStatus('error');
        setTxError('Campaign deadline has passed. Contributions are closed.');
        return;
      }
    }

    // Check balance
    if (BigInt(amount) > BigInt(tokenBalance)) {
      setTxStatus('error');
      setTxError('Insufficient balance to contribute');
      return;
    }

    if (isSandbox) {
      setTxStatus('building');
      setTimeout(() => {
        setTxStatus('success');
        
        // Update campaigns list
        const updated = campaigns.map((c) => {
          if (c.contractAddress === campaignAddress) {
            const raised = c.raised + BigInt(amount);
            return {
              ...c,
              raised,
              goalMet: raised >= c.goal
            };
          }
          return c;
        });
        setCampaigns(updated);

        // Deduct balance
        const newBal = (BigInt(tokenBalance) - BigInt(amount)).toString();
        setTokenBalance(newBal);
        localStorage.setItem(`sandbox_bal_${userAddress}`, newBal);

        // Record donor contribution record locally
        const cachedDonorContrib = localStorage.getItem(`sandbox_contrib_${userAddress}_${campaignAddress}`) || '0';
        const newDonorContrib = (BigInt(cachedDonorContrib) + BigInt(amount)).toString();
        localStorage.setItem(`sandbox_contrib_${userAddress}_${campaignAddress}`, newDonorContrib);

        // Event log
        const mockEvt: DecodedEvent = {
          id: `evt_contrib_${Date.now()}`,
          type: 'contribution',
          contractId: campaignAddress,
          ledger: '101',
          topics: ['contribution', userAddress],
          value: `Contributed: ${amount} Tokens`,
          timestamp: Date.now()
        };
        setRecentEvents((prev) => [mockEvt, ...prev]);
        setContributionAmounts({ ...contributionAmounts, [campaignAddress]: '' });
      }, 1200);
    } else {
      try {
        setTxError(undefined);
        await contributeTx(
          userAddress,
          campaignAddress,
          amount,
          (status, hash, err) => {
            setTxStatus(status);
            setTxHash(hash);
            if (err) setTxError(err);
          }
        );
        setContributionAmounts({ ...contributionAmounts, [campaignAddress]: '' });
        await refreshBalances();
        await loadRealCampaigns();
      } catch (err: any) {
        console.error('Contribution failed:', err);
        setTxStatus('error');
        setTxError(err.message || 'Contribution failed');
      }
    }
  };

  // Withdraw Campaign Funds (Creator only)
  const handleWithdraw = async (campaign: CampaignStatus) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    
    // Check Campaign Target conditions
    if (now < campaign.deadline) {
      setTxStatus('error');
      setTxError('Cannot withdraw before the deadline has expired');
      return;
    }
    if (campaign.raised < campaign.goal) {
      setTxStatus('error');
      setTxError('Goal was not met. Campaign cannot be withdrawn');
      return;
    }

    if (isSandbox) {
      setTxStatus('building');
      setTimeout(() => {
        setTxStatus('success');
        
        // Update campaigns list
        const updated = campaigns.map((c) => {
          if (c.contractAddress === campaign.contractAddress) {
            return { ...c, ended: true };
          }
          return c;
        });
        setCampaigns(updated);

        // Increase creator balance
        if (campaign.creator === userAddress) {
          const newBal = (BigInt(tokenBalance) + campaign.raised).toString();
          setTokenBalance(newBal);
          localStorage.setItem(`sandbox_bal_${userAddress}`, newBal);
        }

        const mockEvt: DecodedEvent = {
          id: `evt_withdraw_${Date.now()}`,
          type: 'withdrawn',
          contractId: campaign.contractAddress,
          ledger: '102',
          topics: ['withdrawn', campaign.creator],
          value: `Withdrawn: ${campaign.raised} Tokens`,
          timestamp: Date.now()
        };
        setRecentEvents((prev) => [mockEvt, ...prev]);
      }, 1500);
    } else {
      try {
        setTxError(undefined);
        await withdrawTx(
          userAddress,
          campaign.contractAddress,
          (status, hash, err) => {
            setTxStatus(status);
            setTxHash(hash);
            if (err) setTxError(err);
          }
        );
        await refreshBalances();
        await loadRealCampaigns();
      } catch (err: any) {
        console.error('Withdrawal failed:', err);
        setTxStatus('error');
        setTxError(err.message || 'Withdrawal failed');
      }
    }
  };

  // Request Donor Refund (Donor only)
  const handleRefund = async (campaignAddress: string) => {
    const campaign = campaigns.find(c => c.contractAddress === campaignAddress);
    if (!campaign) return;
    
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now < campaign.deadline) {
      setTxStatus('error');
      setTxError('Cannot claim refund before campaign deadline has passed');
      return;
    }
    if (campaign.raised >= campaign.goal) {
      setTxStatus('error');
      setTxError('Goal was met. Refunds are disabled');
      return;
    }

    if (isSandbox) {
      setTxStatus('building');
      const contribCached = localStorage.getItem(`sandbox_contrib_${userAddress}_${campaignAddress}`) || '0';
      const contribVal = BigInt(contribCached);
      if (contribVal <= 0n) {
        setTxStatus('error');
        setTxError('No contribution balance found to refund');
        return;
      }

      setTimeout(() => {
        setTxStatus('success');
        
        // Update campaigns list
        const updated = campaigns.map((c) => {
          if (c.contractAddress === campaignAddress) {
            return {
              ...c,
              raised: c.raised - contribVal
            };
          }
          return c;
        });
        setCampaigns(updated);

        // Return balance
        const newBal = (BigInt(tokenBalance) + contribVal).toString();
        setTokenBalance(newBal);
        localStorage.setItem(`sandbox_bal_${userAddress}`, newBal);
        localStorage.setItem(`sandbox_contrib_${userAddress}_campaignAddress`, '0');

        const mockEvt: DecodedEvent = {
          id: `evt_refund_${Date.now()}`,
          type: 'refunded',
          contractId: campaignAddress,
          ledger: '103',
          topics: ['refunded', userAddress],
          value: `Refunded: ${contribVal} Tokens`,
          timestamp: Date.now()
        };
        setRecentEvents((prev) => [mockEvt, ...prev]);
      }, 1500);
    } else {
      try {
        setTxError(undefined);
        await refundTx(
          userAddress,
          campaignAddress,
          (status, hash, err) => {
            setTxStatus(status);
            setTxHash(hash);
            if (err) setTxError(err);
          }
        );
        await refreshBalances();
        await loadRealCampaigns();
      } catch (err: any) {
        console.error('Refund transaction failed:', err);
        setTxStatus('error');
        setTxError(err.message || 'Refund failed');
      }
    }
  };

  // Helper: Format address
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    if (addr.includes('MOCK') || addr.includes('SANDBOX')) return addr;
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
  };

  // Helper: Format countdown timer
  const renderTimeLeft = (deadline: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const diff = deadline - now;
    if (diff <= 0n) {
      return <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>Expired</span>;
    }
    const secs = Number(diff % 60n);
    const mins = Number((diff / 60n) % 60n);
    const hours = Number(diff / 3600n);
    return (
      <span className="text-teal" style={{ fontWeight: 'bold' }}>
        {hours}h {mins}m {secs}s
      </span>
    );
  };

  // Filtering list
  const filteredCampaigns = campaigns.filter((c) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const isExpired = now >= c.deadline;
    
    // Search
    const matchesSearch = c.contractAddress.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.metadataUri.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Filters
    if (filterStatus === 'active') return !isExpired && !c.ended;
    if (filterStatus === 'success') return c.raised >= c.goal;
    if (filterStatus === 'failed') return isExpired && c.raised < c.goal;
    return true;
  });

  // Calculate Cumulative Dashboard Stats
  const totalCampaigns = campaigns.length;
  const totalRaised = campaigns.reduce((acc, curr) => acc + curr.raised, 0n);
  const activeCampaigns = campaigns.filter((c) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    return now < c.deadline && !c.ended;
  }).length;

  // Unsplash curated fallback images for campaigns based on metadata or index
  const getCampaignImage = (metadata: string, index: number) => {
    if (metadata.startsWith('http')) return metadata;
    const lower = metadata.toLowerCase();
    if (lower.includes('ocean') || lower.includes('sea') || lower.includes('water')) {
      return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80';
    }
    if (lower.includes('solar') || lower.includes('power') || lower.includes('kit') || lower.includes('energy')) {
      return 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=500&auto=format&fit=crop&q=80';
    }
    if (lower.includes('book') || lower.includes('library') || lower.includes('school')) {
      return 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=500&auto=format&fit=crop&q=80';
    }
    const fallbacks = [
      'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=500&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&auto=format&fit=crop&q=80'
    ];
    return fallbacks[index % fallbacks.length];
  };

  // Event Icons Helper
  const renderEventIcon = (type: string) => {
    switch (type) {
      case 'campaign_created':
        return <span style={{ color: 'var(--success)' }}>🚀</span>;
      case 'contribution':
        return <span style={{ color: 'var(--accent)' }}>💖</span>;
      case 'withdrawn':
        return <span style={{ color: 'var(--warning)' }}>💸</span>;
      case 'refunded':
        return <span style={{ color: 'var(--danger)' }}>↩️</span>;
      default:
        return <span>ℹ️</span>;
    }
  };

  // Transaction Monitor status details
  const renderTxnStepInfo = () => {
    const steps = [
      { key: 'building', label: '1. Building Tx Envelope' },
      { key: 'awaiting signature', label: '2. Signature Requested' },
      { key: 'submitting', label: '3. Broadcasting' },
      { key: 'confirming', label: '4. Confirming Ledger' }
    ];

    const getStepStatusClass = (stepKey: string) => {
      if (txStatus === 'error') return 'text-muted';
      if (txStatus === 'success') return 'text-teal';
      
      const statusOrder = ['building', 'awaiting signature', 'submitting', 'confirming'];
      const currentIndex = statusOrder.indexOf(txStatus);
      const stepIndex = statusOrder.indexOf(stepKey);

      if (currentIndex > stepIndex) return 'text-teal';
      if (currentIndex === stepIndex) return 'text-indigo';
      return 'text-muted';
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        {steps.map((st) => (
          <div key={st.key} className="flex-between" style={{ fontSize: '13px' }}>
            <span className={getStepStatusClass(st.key)} style={{ fontWeight: txStatus === st.key ? 'bold' : 'normal' }}>
              {st.label}
            </span>
            {txStatus === st.key && <span className="live-dot" style={{ backgroundColor: 'var(--primary)' }}></span>}
            {['building', 'awaiting signature', 'submitting', 'confirming'].indexOf(txStatus) > ['building', 'awaiting signature', 'submitting', 'confirming'].indexOf(st.key) && (
              <span style={{ color: 'var(--success)' }}>✓</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navbar */}
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <span className="logo-text">NOVAFUND</span>
            <span className="badge-soroban">Stellar Soroban</span>
            {isSandbox && (
              <span className="badge-soroban" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
                Sandbox Simulation
              </span>
            )}
          </div>

          <div className="flex-row">
            {walletConnected ? (
              <div className="flex-row" style={{ gap: '14px' }}>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Token Balance</span>
                  <span className="text-teal text-mono" style={{ fontWeight: '800', fontSize: '14px' }}>
                    {tokenBalance} TOK <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>/ {nativeBalance} XLM</span>
                  </span>
                </div>
                
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="live-dot" style={{ backgroundColor: isSandbox ? '#f59e0b' : '#10b981' }}></span>
                  <span className="text-mono" style={{ fontSize: '13px', fontWeight: '600' }}>{formatAddress(userAddress)}</span>
                </div>

                <button onClick={handleMintTokens} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12px' }}>
                  Faucet Fund
                </button>
                
                <button onClick={handleDisconnect} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '12px', borderColor: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5' }}>
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex-row" style={{ gap: '12px' }}>
                <button onClick={() => handleConnectWallet('freighter')} className="btn-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>
                  Connect Freighter
                </button>
                <button onClick={() => handleConnectWallet('sandbox')} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '13px' }}>
                  Demo Sandbox
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Campaign Container */}
      <main className="app-container">
        
        {/* Hero Section */}
        <section className="hero-section">
          <div style={{ position: 'relative', zIndex: '1' }}>
            <h1 className="hero-title glow-text-rainbow">Decentralized Crowdfunding</h1>
            <p className="hero-desc">
              NovaFund is a secure, trustless platform for launch campaigns built on top of the Stellar Soroban smart contract network. Keep all funds in secure smart escrows that guarantee automatic creator payout or contributor refunds.
            </p>
            
            {/* Quick dashboard stats list */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Total Campaigns</span>
                <span className="stat-value text-indigo">{totalCampaigns}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Active Campaigns</span>
                <span className="stat-value text-teal">{activeCampaigns}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Cumulative Contributed</span>
                <span className="stat-value text-pink">{totalRaised.toString()} TOK</span>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic two-column workspace */}
        <div className="main-layout">
          {/* Left Column: Form & Activity timeline */}
          <aside className="sidebar">
            {/* Launch Campaign */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h2 className="card-title">Launch Campaign</h2>
              <form onSubmit={handleCreateCampaign}>
                <div className="form-group">
                  <label className="form-label">Goal Amount (TOK)</label>
                  <input
                    type="number"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="form-input text-mono"
                    placeholder="e.g. 1000"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (Seconds)</label>
                  <input
                    type="number"
                    value={durationSecs}
                    onChange={(e) => setDurationSecs(e.target.value)}
                    className="form-input text-mono"
                    placeholder="e.g. 3600"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Metadata URI (IPFS / HTTP Link)</label>
                  <input
                    type="text"
                    value={metadataUri}
                    onChange={(e) => setMetadataUri(e.target.value)}
                    className="form-input"
                    placeholder="ipfs://your-campaign-meta or https://..."
                    required
                  />
                </div>

                {!walletConnected ? (
                  <div style={{ fontSize: '13px', color: '#f59e0b', textAlign: 'center', padding: '12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.15)', fontWeight: 'bold' }}>
                    Connect wallet to launch campaigns
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={txStatus !== 'idle' && txStatus !== 'success' && txStatus !== 'error'}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                  >
                    Create Campaign Smart Escrow
                  </button>
                )}
              </form>
            </div>

            {/* Live Events Timeline */}
            <div className="glass-card" style={{ padding: '24px' }}>
              <h2 className="card-title">Live Ledger Activity</h2>
              <div className="event-list">
                {recentEvents.length === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>
                    No recent campaign events detected.
                  </div>
                ) : (
                  recentEvents.map((evt) => (
                    <div key={evt.id} className="event-card">
                      <div className="flex-between" style={{ marginBottom: '8px' }}>
                        <span className="badge-soroban" style={{ fontSize: '9px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {renderEventIcon(evt.type)} {evt.type.replace('_', ' ')}
                        </span>
                        <span className="text-muted text-mono" style={{ fontSize: '10px' }}>Ledger #{evt.ledger}</span>
                      </div>
                      <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: '600', color: 'white' }}>{evt.value.toString()}</p>
                      <div className="flex-between" style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {evt.topics[1] && (
                          <span className="text-mono">
                            By: {formatAddress(evt.topics[1].toString())}
                          </span>
                        )}
                        <span>{new Date(evt.timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Right Column: Cards Panel */}
          <div className="content-section">
            
            {/* Search/Sort and Controls */}
            <div className="flex-between" style={{ background: 'rgba(13, 17, 34, 0.4)', padding: '16px 20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.03)', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ flex: '1', minWidth: '240px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search campaigns by address or metadata..."
                  className="form-input"
                  style={{ padding: '10px 16px', fontSize: '14px' }}
                />
              </div>
              <div className="pill-filter">
                {(['all', 'active', 'success', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setFilterStatus(st)}
                    className={`pill-btn ${filterStatus === st ? 'active' : ''}`}
                  >
                    {st.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaigns Grid */}
            <div className="grid-container">
              {loadingCampaigns ? (
                <div className="glass-card shimmer" style={{ gridColumn: '1 / -1', padding: '80px 0', textAlign: 'center' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--text-secondary)' }}>Loading campaigns from Soroban ledger...</p>
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '80px 0', textAlign: 'center', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '20px' }}>
                  <span style={{ fontSize: '28px' }}>🔍</span>
                  <p className="text-muted" style={{ fontSize: '15px', marginTop: '12px', fontWeight: '600' }}>
                    No crowdfunding campaigns matched your search criteria.
                  </p>
                </div>
              ) : (
                filteredCampaigns.map((camp, index) => {
                  const progress = calculateProgress(camp.raised, camp.goal);
                  const isFinished = camp.ended;
                  const now = BigInt(Math.floor(Date.now() / 1000));
                  const isExpired = now >= camp.deadline;
                  
                  // Status tag label helper
                  const renderStatusBadge = () => {
                    if (isFinished) return <span className="badge-tag badge-expired">Concluded 🔴</span>;
                    if (camp.goalMet) return <span className="badge-tag badge-success">Target Met 🏆</span>;
                    if (isExpired) return <span className="badge-tag badge-expired">Expired ⌛</span>;
                    return <span className="badge-tag badge-active">Active 🟢</span>;
                  };

                  return (
                    <div key={camp.contractAddress} className="glass-card campaign-card">
                      {/* Cover Photo */}
                      <div className="campaign-header-img" style={{ backgroundImage: `url(${getCampaignImage(camp.metadataUri, index)})` }}>
                        <div className="campaign-overlay">
                          <div className="flex-between">
                            <span className="text-mono" style={{ fontSize: '11px', background: 'rgba(6, 8, 20, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                              {formatAddress(camp.contractAddress)}
                            </span>
                            {renderStatusBadge()}
                          </div>
                        </div>
                      </div>

                      {/* Details Box */}
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: '1', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: 'white' }}>
                            {camp.metadataUri.startsWith('http') ? `Campaign #${index + 1}` : camp.metadataUri}
                          </h3>
                          
                          <div className="flex-between" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                            <span>Escrow Admin</span>
                            <span className="text-mono text-teal">{formatAddress(camp.creator)}</span>
                          </div>

                          {/* Progress visualizer */}
                          <div>
                            <div className="flex-between" style={{ fontSize: '13px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: '850', color: 'white' }}>
                                {camp.raised.toString()} <span style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>/ {camp.goal.toString()} TOK</span>
                              </span>
                              <span className="text-teal text-mono" style={{ fontWeight: 'bold' }}>{progress}%</span>
                            </div>
                            
                            <div className="progress-bar-container">
                              <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                            </div>
                            
                            <div className="flex-between" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                              <span>Goal: {camp.goal.toString()} TOK</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>Time left:</span> {renderTimeLeft(camp.deadline)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Buttons */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '16px' }}>
                          {isFinished ? (
                            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Campaign Completed
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Donate inputs */}
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                  type="number"
                                  value={contributionAmounts[camp.contractAddress] || ''}
                                  onChange={(e) => setContributionAmounts({
                                    ...contributionAmounts,
                                    [camp.contractAddress]: e.target.value
                                  })}
                                  disabled={!walletConnected || isExpired}
                                  placeholder="Amount (TOK)"
                                  className="form-input text-mono"
                                  style={{ padding: '8px 12px', fontSize: '13px', flex: '1' }}
                                />
                                <button
                                  onClick={() => handleContribute(camp.contractAddress)}
                                  disabled={!walletConnected || isExpired}
                                  className="btn-primary"
                                  style={{ padding: '8px 18px', fontSize: '13px', whiteSpace: 'nowrap' }}
                                >
                                  Contribute
                                </button>
                              </div>

                              {/* Escrow withdrawals & refunds */}
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                  onClick={() => handleWithdraw(camp)}
                                  disabled={!walletConnected || isFinished}
                                  className="btn-secondary"
                                  style={{ flex: '1', padding: '8px 10px', fontSize: '12px', justifyContent: 'center' }}
                                >
                                  Claim Payout
                                </button>
                                <button
                                  onClick={() => handleRefund(camp.contractAddress)}
                                  disabled={!walletConnected}
                                  className="btn-secondary"
                                  style={{ flex: '1', padding: '8px 10px', fontSize: '12px', justifyContent: 'center', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
                                >
                                  Claim Refund
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Floating System Transaction Progress Box */}
      {txStatus !== 'idle' && (
        <div className="txn-monitor-floating glass-card" style={{ padding: '20px', borderLeft: txStatus === 'error' ? '4px solid var(--danger)' : txStatus === 'success' ? '4px solid var(--success)' : '4px solid var(--primary)' }}>
          <div className="flex-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Stellar Soroban Ledger Tx
            </span>
            <button onClick={() => setTxStatus('idle')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>✕</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="flex-row" style={{ gap: '8px' }}>
              <span className="live-dot" style={{ backgroundColor: txStatus === 'error' ? 'var(--danger)' : txStatus === 'success' ? 'var(--success)' : 'var(--primary)' }}></span>
              <span style={{ fontWeight: '850', fontSize: '14px', textTransform: 'uppercase', color: 'white' }}>
                {txStatus}
              </span>
            </div>

            {txStatus !== 'error' && txStatus !== 'success' && renderTxnStepInfo()}

            {txHash && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-mono"
                style={{ fontSize: '12px', color: 'var(--secondary)', textDecoration: 'underline', marginTop: '6px', display: 'inline-block' }}
              >
                Explorer Tx: {txHash.substring(0, 8)}...{txHash.substring(txHash.length - 8)}
              </a>
            )}

            {txError && (
              <p style={{ fontSize: '12px', margin: '8px 0 0 0', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.15)', color: '#fca5a5', lineHeight: '1.4' }}>
                {txError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border-glow)', padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#03050c', marginTop: 'auto' }}>
        <p style={{ margin: '0', fontWeight: '700' }}>NovaFund Crowdfunding Platform &copy; 2026</p>
        <p className="text-mono" style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '10px' }}>Contract Factory: {factoryAddress}</p>
      </footer>
    </div>
  );
}
