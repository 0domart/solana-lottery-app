import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { BN } from "@project-serum/anchor";
import { SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

import {
  getLotteryAddress,
  getMasterAddress,
  getProgram,
  getTicketAddress,
  getTotalPrize,
} from "../utils/program";
import { confirmTx, mockWallet } from "../utils/helper";
import toast from 'react-hot-toast';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [masterAddress, setMasterAddress] = useState();
  const [lotteryAddress, setLotteryAddress] = useState();
  const [lottery, setLottery] = useState();
  const [lotteryPot, setLotteryPot] = useState();
  const [lotteryPlayers, setPlayers] = useState([]);
  const [lotteryId, setLotteryId] = useState();
  const [lotteryHistory, setLotteryHistory] = useState([]);
  const [userWinningId, setUserWinningId] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [intialized, setIntialized] = useState(false)

  // Get provider
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const program = useMemo(() => {
    if (connection) {
      return getProgram(connection, wallet ?? mockWallet());
    }
  }, [connection, wallet]);

  useEffect(() => {
    updateState();
  }, [program]);

  useEffect(() => {
    if (!lottery) return;
    getPot();
    getPlayers();
    getHistory();
  }, [lottery]);

  const updateState = async () => {
    if (!program) return;

    try {
      if (!masterAddress) {
        const masterAddress = await getMasterAddress();
        setMasterAddress(masterAddress);
      }
      const master = await program.account.master.fetch(
        masterAddress ?? (await getMasterAddress())
      );
      setIntialized(true)
      setLotteryId(master.lastId);
      const lotteryAddress = await getLotteryAddress(master.lastId);
      setLotteryAddress(lotteryAddress);
      const lottery = await program.account.lottery.fetch(lotteryAddress);
      setLottery(lottery);

      // Get user's tickets for the current lottery
      if (!wallet?.publicKey) return;
      const userTickets = await program.account.ticket.all([
        {
          memcmp: {
            bytes: bs58.encode(new BN(lotteryId).toArrayLike(Buffer, "le", 4)),
            offset: 12,
          },
        },
        { memcmp: { bytes: wallet.publicKey.toBase58(), offset: 16 } },
      ]);

      // Check whether any of the user tickets win
      const userWin = userTickets.some(
        (t) => t.account.id === lottery.winnerId
      );
      if (userWin) {
        setUserWinningId(lottery.winnerId);
      } else {
        setUserWinningId(null);
      }
    } catch (err) {
      console.log(err.message);
    }
  };

  const getPot = async () => {
    const pot = getTotalPrize(lottery);
    setLotteryPot(pot);
  };

  const getPlayers = async () => {
    const players = [lottery.lastTicketId];
    setPlayers(players);
  };

  const getHistory = async () => {
    if (!lotteryId) return;

    const participants = await getParticipants();
    console.log(participants);

    const history = [];

    for(const i in new Array(lotteryId).fill(null)){
      const id = lotteryId - parseInt(i);
      if(!id) break;
      console.log("id", id);
      const lotteryAddress = await getLotteryAddress(id);
      const lottery = await program.account.lottery.fetch(lotteryAddress);

      if (!lottery.winnerId) continue;
      const winnerId = lottery.winnerId;

      const ticket_winner_address = await getTicketAddress(lotteryAddress, winnerId);
      const ticket_winner = await program.account.ticket.fetch(ticket_winner_address);

      history.push({ 
        lotteryId: id, 
        winnerId: winnerId, 
        winnerAddress: ticket_winner.authority, 
        prize: getTotalPrize(lottery),
        participants:participants[id]
      })

      setLotteryHistory(history);
    }
  }

  const getParticipants = async () => {
    try {
      const response = await program.account.ticket.all();
      const participants = response.reduce((acc, item) => {
        const { publicKey, account: { id, lotteryId, authority } } = item;
        if (!acc[lotteryId]) {
          acc[lotteryId] = {
            lotteryId: lotteryId,
            count: 1,
            participants: [{ publicKey, account: { id, authority } }],
          };
        } else {
          acc[lotteryId].count++;
          acc[lotteryId].participants.push({ publicKey, account: { id, authority } });
        }
        return acc;
      }, {});
      return participants;
    } catch (error) {
      console.error(error);
    }
  };

  const initMaster = async () => {
    setError("");
    setSuccess("");
    console.log("Running")
    try {
      const txHash = await program.methods
        .initMaster()
        .accounts({
          master: masterAddress,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(txHash, connection);

      updateState();
      toast.success("Initialized Master")
    } catch (err) {
      setError(err.message);
      toast.error("Initializing FAILED!")
    }
  };

  const createLottery = async () => {
    setError("");
    setSuccess("");
    console.log("Running")
    try {
      const lotteryAdress = await getLotteryAddress(lotteryId+1);
      const txHash = await program.methods
        .createLottery(new BN(1).mul(new BN(LAMPORTS_PER_SOL)))
        .accounts({
          lottery: lotteryAdress,
          master: masterAddress,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(txHash, connection);

      updateState();
      toast.success("Created a Lottery")
    } catch (err) {
      setError(err.message);
      toast.error("Lottery Creation FAILED!")
    }
  };

  const buyTicket = async () => {
    setError("");
    setSuccess("");
    console.log("Running")
    try {
      const lotteryAdress = await getLotteryAddress(lotteryId);
      const ticketAddress = await getTicketAddress(lotteryAddress, lottery.lastTicketId+1);

      const txHash = await program.methods
        .buyTicket(lotteryId)
        .accounts({
          lottery: lotteryAdress,
          ticket: ticketAddress,
          buyer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(txHash, connection);

      updateState();
      toast.success("Buy a Ticket")
    } catch (err) {
      setError(err.message);
      toast.error("Ticket Buy FAILED!")
    }
  };

  const pickWinner = async () => {
    setError("");
    setSuccess("");
    console.log("Running")
    try {
      const lotteryAdress = await getLotteryAddress(lotteryId);
      const txHash = await program.methods
        .pickWinner(lotteryId)
        .accounts({
          lottery: lotteryAdress,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(txHash, connection);

      updateState();
      toast.success("Winner Picked")
    } catch (err) {
      setError(err.message);
      toast.error("Winner Pick FAILED!")
    }
  };

  const claimPrize = async () => {
    setError("");
    setSuccess("");
    console.log("Running")
    try {
      const lotteryAdress = await getLotteryAddress(lotteryId);
      const txHash = await program.methods
        .claimPrize(lotteryId, userWinningId)
        .accounts({
          lottery: lotteryAdress,
          ticket: await getTicketAddress(lotteryAdress, userWinningId),
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await confirmTx(txHash, connection);

      updateState();
      toast.success("Prize Claimed")
    } catch (err) {
      setError(err.message);
      toast.error("Prize claim FAILED!")
    }
  };

  return (
    <AppContext.Provider
      value={{
        isMasterInitialized: intialized,
        connected: wallet?.publicKey ? true : false,
        isLotteryAuthority:
          wallet && lottery && wallet.publicKey.equals(lottery.authority),
        lotteryId,
        lotteryPot,
        lotteryPlayers,
        lotteryHistory,
        isFinished: lottery && lottery.winnerId,
        canClaim: lottery && !lottery.claimed && userWinningId,
        initMaster,
        createLottery,
        buyTicket,
        pickWinner,
        claimPrize,
        error,
        success,
        intialized
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  return useContext(AppContext);
};
