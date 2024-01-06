import style from "../styles/TableRow.module.css";
import { shortenPk } from "../utils/helper";

const TableRow = ({
  lotteryId,
  winnerAddress = "4koeNJ39zejjuCyVQdZmzsx28CfJoarrv4vmsuHjFSB6",
  winnerId,
  prize,
  participants
}) => {
  return (
    <div className={style.wrapper}>
      <div>#{lotteryId}</div>
      <div>{shortenPk(winnerAddress)}</div>
      <div>#{winnerId}</div>
      <div>+{prize} SOL</div>
      <div>{participants?.count}</div>
      <div>
        {participants?.participants?.map((h, i) => (
          <span>{shortenPk(h.publicKey)} /// </span>
        ))}
      </div>
    </div>
  );
};

export default TableRow;
