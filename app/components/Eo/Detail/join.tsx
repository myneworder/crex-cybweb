import * as React from "react";
import BindToChainState from "../../Utility/BindToChainState";
import AccountActions from "actions/AccountActions";
import AccountStore from "stores/AccountStore";
import AmountSelector from "components/Utility/AmountSelector";
import { connect } from "alt-react";
import "./join.scss";
import * as fetchJson from "../service";
import Translate from "react-translate-component";
import { ChainStore, FetchChain } from "cybexjs";
import { checkFeeStatusAsync, checkBalance } from "common/trxHelper";
import utils from "common/utils";
import BalanceComponent from "components/Utility/BalanceComponent";
import { Asset } from "common/MarketClasses";
import classnames from "classnames";
import ChainTypes from "components/Utility/ChainTypes";
import { Button } from "components/Common/Button";
import { Colors } from "components/Common/Colors";
import TransactionConfirmStore from "stores/TransactionConfirmStore";
import { BigNumber } from "bignumber.js";
import { NotificationActions } from "actions//NotificationActions";
import * as moment from "moment";
import ReactTooltip from "react-tooltip";
import ErrorTipBox from "components/Utility/ErrorTipBox";
import { Fallback } from "./../Fallback";
import LoadingIndicator from "components/LoadingIndicator";

const KYC_STATUS_OK = "ok";

const getPrecision = (digits: number = 0) => {
  return new BigNumber(1).dividedBy(Math.pow(10, digits)).toNumber();
};

const getProjectStat = (
  project: ETO.ProjectDetail,
  status: ETO.AccountStatus
) => {
  return new ProjectStat(project, status);
};

class ProjectStat {
  constructor(
    private pDetail: ETO.ProjectDetail,
    private pStatus: ETO.AccountStatus
  ) {}

  get pUsed() {
    return this.pStatus.base_received;
  }

  // get accountLimit

  get isDelay() {
    return !!this.pDetail.offer_at;
  }

  get amountRemained() {
    if (!this.pDetail.base_token_count) {
      return this.pDetail.base_token_count;
    }
    let { current_base_token_count } = this.pDetail;

    return new BigNumber(this.pDetail.base_token_count)
      .minus(current_base_token_count)
      .toNumber();
  }

  get pAvail() {
    if (!this.pDetail.base_max_quota) {
      return this.pDetail.base_max_quota;
    }
    return new BigNumber(this.pDetail.base_max_quota)
      .minus(this.pStatus.base_received)
      .toNumber();
  }

  get precision() {
    return getPrecision(this.pDetail.base_accuracy);
  }
}

let Join = class extends React.Component<
  any,
  {
    amount;
    asset_id: null;
    asset;
    error;
    feeAsset;
    fee_asset_id: string;
    feeAmount: Asset;
    feeStatus;
    hasBalance;
    hasPoolBalance;
    memo;
    projectData;
    personalStatus;
    balanceError;
    isOpen;
    fetchError;
    btnTimer;
    canJoin;
    loading;
  }
> {
  static propTypes = {
    currentAccount: ChainTypes.ChainAccount
  };

  // static defaultProps = {
  //   currentAccount: Map({})
  // };

  nestedRef;
  btnTimer;
  timer;
  timerCounter = 0;

  constructor(props) {
    super(props);

    this.state = {
      amount: "",
      asset_id: null,
      asset: null,
      error: null,
      feeAsset: null,
      hasBalance: false,
      hasPoolBalance: false,
      fee_asset_id: "1.3.0",
      feeAmount: new Asset({ amount: 0 }),
      feeStatus: {},
      balanceError: null,
      projectData: null,
      personalStatus: null,
      memo: null,
      isOpen: true,
      fetchError: false,
      btnTimer: 0,
      canJoin: true,
      loading: true
    };

    this._updateFee = this._updateFee.bind(this);
    this._checkFeeStatus = this._checkFeeStatus.bind(this);
    this._checkBalance = this._checkBalance.bind(this);
  }

  componentDidMount() {
    this.updateProject();
    this.timer = setInterval(() => {
      this.updateState();
    }, 3000);
  }

  componentWillUnmount() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  checkUserStatue = () => {
    if (!this.props.currentAccount || !this.props.currentAccount.get) return;
    let data = {
      project: this.props.match.params.id,
      cybex_name: this.props.currentAccount.get("name")
    };
  };

  updateState = () => {
    let data = {
      project: this.props.match.params.id,
      cybex_name: this.props.currentAccount.get("name")
    };
    Promise.all([
      new Promise(resolve => {
        fetchJson.updateStatus(
          data,
          res => {
            let currentState = res.result;
            if (!currentState) {
              // if (!currentState || !currentState.real) {
              resolve({});
            } else {
              resolve(currentState);
            }
          },
          error => {
            throw error;
          }
        );
      }),
      new Promise(resolve => {
        fetchJson.updateUserStatus(
          data,
          res => {
            let currentState = res.result;
            if (!currentState) {
              // if (!currentState || !currentState.real) {
              resolve({});
            } else {
              resolve(currentState);
            }
          },
          error => {
            throw error;
          }
        );
      })
    ])
      .then(
        ([projectData, personalStatusRaw]: [
          ETO.CurrentState,
          { current_base_token_count }
        ]) => {
          let { current_base_token_count: base_received } = personalStatusRaw;
          console.debug("PStatus: ", projectData, personalStatusRaw);
          let personalStatus;
          if (base_received) {
            personalStatus = { base_received };
          } else {
            personalStatus = {};
          }

          this.setState(prevState => ({
            projectData: {
              ...prevState.projectData,
              ...projectData
            },
            personalStatus: {
              ...prevState.personalStatus,
              ...personalStatus
            }
          }));
          console.debug(
            "Latest State of Join: ",
            projectData,
            personalStatusRaw
          );
        }
      )
      .catch(error => {
        console.error("Fetch Latest State Error: ", error);
      });
  };

  updateProject = () => {
    if (!this.props.currentAccount || !this.props.currentAccount.get) return;
    let data = {
      project: this.props.match.params.id,
      cybex_name: this.props.currentAccount.get("name")
    };
    Promise.all([
      new Promise((resolve, reject) =>
        fetchJson.fetchDetails(
          {
            project: this.props.match.params.id
          },
          res => {
            resolve(res.result);
          },
          error => {
            reject(error);
          }
        )
      ),
      new Promise((resolve, reject) =>
        fetchJson.fetchUserProjectStatus(
          data,
          res => {
            resolve(res.result);
          },
          error => {
            reject(error);
          }
        )
      ),
      new Promise((resolve, reject) =>
        fetchJson.fetchKYC(
          data,
          res => {
            resolve(res.result);
          },
          error => {
            reject(error);
          }
        )
      )
    ])
      .then(([projectData, personalStatus, kycStatus]) => {
        let isOpen = projectData["status"] === "ok";
        let canJoin =
          (kycStatus as any).status &&
          (kycStatus as any).status === KYC_STATUS_OK;
        this.setState({
          projectData,
          personalStatus,
          isOpen,
          canJoin,
          loading: false,
          fetchError: false
        });
      })
      .catch(error => {
        console.debug("Fetch Error: ", error);
        this.setState({ fetchError: true, loading: false });
        setTimeout(() => {
          this.updateProject();
        }, 3000);
      });
    this._updateFee();
  };
  onAmountChanged({ amount, asset }) {
    if (!asset) {
      return;
    }
    this.setState(
      { amount, asset, asset_id: asset.get("id"), error: null },
      this._checkBalance
    );
  }

  _checkBalance() {
    const { feeAmount, amount, asset } = this.state;
    let { currentAccount: from_account } = this.props;

    if (!asset) return;
    if (!asset || !from_account) return;
    const balanceID = from_account.getIn(["balances", asset.get("id")]);
    const feeBalanceID = from_account.getIn(["balances", feeAmount.asset_id]);
    if (!balanceID) return this.setState({ balanceError: true });
    let balanceObject = ChainStore.getObject(balanceID);
    let feeBalanceObject = feeBalanceID
      ? ChainStore.getObject(feeBalanceID)
      : null;
    if (!feeBalanceObject || feeBalanceObject.get("balance") === 0) {
      this.setState({ fee_asset_id: "1.3.0" }, this._updateFee);
    }
    if (!balanceObject || !feeAmount) return;
    const hasBalance = checkBalance(amount, asset, feeAmount, balanceObject);
    if (hasBalance === null) return;
    this.setState({ balanceError: !hasBalance });
  }

  _checkFeeStatus(account = this.props.currentAccount) {
    if (!account || !account.get) return;

    const assets = Object.keys(account.get("balances").toJS()).sort(
      utils.sortID
    );
    let feeStatus = {};
    let p = [];
    assets.forEach(a => {
      p.push(
        checkFeeStatusAsync({
          accountID: account.get("id"),
          feeID: a,
          options: ["price_per_kbyte"],
          data: {
            type: "memo",
            content: this.state.memo
          }
        })
      );
    });
    Promise.all(p)
      .then(status => {
        assets.forEach((a, idx) => {
          feeStatus[a] = status[idx];
        });
        if (!utils.are_equal_shallow(this.state.feeStatus, feeStatus)) {
          this.setState({
            feeStatus
          });
        }
        this._checkBalance();
      })
      .catch(err => {
        console.error(err);
      });
  }
  _getAvailableAssets(state = this.state) {
    const { feeStatus } = this.state;
    function hasFeePoolBalance(id) {
      if (feeStatus[id] === undefined) return true;
      return feeStatus[id] && feeStatus[id].hasPoolBalance;
    }

    function hasBalance(id) {
      if (feeStatus[id] === undefined) return true;
      return feeStatus[id] && feeStatus[id].hasBalance;
    }

    let { currentAccount: from_account } = this.props;
    let asset_types = [],
      fee_asset_types = [];
    if (!(from_account && from_account.get("balances"))) {
      return { asset_types, fee_asset_types };
    }
    let account_balances = from_account.get("balances").toJS();
    asset_types = Object.keys(account_balances).sort(utils.sortID);
    fee_asset_types = Object.keys(account_balances).sort(utils.sortID);
    for (let key in account_balances) {
      let balanceObject = ChainStore.getObject(account_balances[key]);
      if (balanceObject && balanceObject.get("balance") === 0) {
        asset_types.splice(asset_types.indexOf(key), 1);
        if (fee_asset_types.indexOf(key) !== -1) {
          fee_asset_types.splice(fee_asset_types.indexOf(key), 1);
        }
      }
    }

    fee_asset_types = fee_asset_types.filter(a => {
      return hasFeePoolBalance(a) && hasBalance(a);
    });

    return { asset_types, fee_asset_types };
  }
  _updateFee(state = this.state) {
    let { fee_asset_id } = state;
    let { currentAccount: from_account } = this.props;

    const { fee_asset_types } = this._getAvailableAssets(state);
    if (fee_asset_types.length === 1 && fee_asset_types[0] !== fee_asset_id) {
      fee_asset_id = fee_asset_types[0];
    }
    if (!from_account) return null;
    checkFeeStatusAsync({
      accountID: from_account.get("id"),
      feeID: fee_asset_id,
      options: ["price_per_kbyte"],
      data: {
        type: "memo",
        content: state.memo
      }
    }).then(({ fee, hasBalance, hasPoolBalance }) => {
      this.setState({
        feeAmount: fee,
        fee_asset_id: fee.asset_id,
        hasBalance,
        hasPoolBalance,
        error: !hasBalance || !hasPoolBalance
      });
    });
  }

  _setTotal(asset_id, balance_id) {
    const { feeAmount } = this.state;
    let balanceObject = ChainStore.getObject(balance_id);
    let transferAsset = ChainStore.getObject(asset_id);

    let balance = new Asset({
      amount: balanceObject.get("balance"),
      asset_id: transferAsset.get("id"),
      precision: transferAsset.get("precision")
    });

    if (balanceObject) {
      if (feeAmount.asset_id === balance.asset_id) {
        balance.minus(feeAmount);
      }
      this.setState(
        { amount: balance.getAmount({ real: true }) },
        this._checkBalance
      );
    }
  }

  shouldComponentUpdate(np, ns) {
    let { asset_types: current_types } = this._getAvailableAssets();
    let { asset_types: next_asset_types } = this._getAvailableAssets(ns);

    if (next_asset_types.length === 1) {
      let asset = ChainStore.getAsset(next_asset_types[0]);
      if (current_types.length !== 1) {
        this.onAmountChanged({ amount: ns.amount, asset });
      }

      if (next_asset_types[0] !== this.state.fee_asset_id) {
        if (asset && this.state.fee_asset_id !== next_asset_types[0]) {
          this.setState({
            feeAsset: asset,
            fee_asset_id: next_asset_types[0]
          });
        }
      }
    }
    return true;
  }

  onFeeChanged({ asset }) {
    this.setState(
      { feeAsset: asset, fee_asset_id: asset.get("id"), error: null },
      this._updateFee
    );
  }

  componentWillMount() {
    this.nestedRef = null;
    this._updateFee();
    this._checkFeeStatus();
  }

  setNestedRef(ref) {
    this.nestedRef = ref;
  }

  setButtonLock() {
    this.setState({
      btnTimer: 40
    });
    this.btnTimer = setInterval(() => {
      if (this.state.btnTimer >= 1) {
        this.setState(state => ({ btnTimer: state.btnTimer - 1 }));
      } else {
        clearInterval(this.btnTimer);
      }
    }, 1000);
  }

  onTrxIncluded = confirm_store_state => {
    if (
      confirm_store_state.included &&
      confirm_store_state.broadcasted_transaction
    ) {
      TransactionConfirmStore.unlisten(this.onTrxIncluded);
      TransactionConfirmStore.reset();
    } else if (confirm_store_state.closed) {
      TransactionConfirmStore.unlisten(this.onTrxIncluded);
      TransactionConfirmStore.reset();
    }
  };

  _getConfirmTip = () => {
    let { projectData } = this.state || { projectData: {} };
    let { name } = projectData;
    if (name) {
      return (
        <>"         "<Translate
            className="confirm-tip text-center"
            content="eto.confirm"
            component="h5"
            style={{ marginTop: "1em" }}
            project={name}
          />"
         "<Translate
            className="confirm-tip text-center"
            content="eto.dont_repeat"
            style={{ maxWidth: "40em", margin: "auto" }}
            component="p"
          />"       "</>
      );
    } else return null;
  };

  onSubmit = async e => {
    e.preventDefault();
    const { asset, amount } = this.state;
    const sendAmount = new Asset({
      real: amount,
      asset_id: asset.get("id"),
      precision: asset.get("precision")
    });
    let targetAccount = await FetchChain(
      "getAccount",
      this.state.projectData.receive_address
    );
    if (!targetAccount) {
      return NotificationActions.error("Project address error");
    }
    AccountActions.transfer(
      this.props.currentAccount.get("id"),
      targetAccount.get("id"), // Todo confirm receive account
      sendAmount.getAmount(),
      asset.get("id"),
      this.state.memo ? new Buffer(this.state.memo, "utf-8") : this.state.memo,
      null,
      this.state.feeAsset ? this.state.feeAsset.get("id") : "1.3.0",
      null,
      this._getConfirmTip()
    )
      .then(() => {
        TransactionConfirmStore.unlisten(this.onTrxIncluded);
        TransactionConfirmStore.listen(this.onTrxIncluded);
        this.setButtonLock();
      })
      .catch(e => {
        let msg = e.message ? e.message.split("\n")[1] : null;
        console.log("error: ", e, msg);
        this.setState({ error: msg });
      });
  };

  render() {
    console.log(this.state);
    if (this.state.loading) {
      return <LoadingIndicator />;
    }

    if (this.state.fetchError) {
      return <Fallback />;
    }

    const data = this.state.projectData || {};
    const {
      name,
      receive_address,
      current_user_count,
      current_base_token_count,
      base_max_quota,
      base_min_quota,
      base_token_count,
      base_token_name,
      end_at,
      base_token,
      status,
      base_accuracy
    } = data;
    const statusData = this.state.personalStatus || {};

    let { currentAccount } = this.props;
    let {
      asset,
      asset_id,
      feeAmount,
      amount,
      error,
      feeAsset,
      fee_asset_id,

      balanceError,
      canJoin
    } = this.state;
    let isOpen = status === "ok";
    //
    let { asset_types, fee_asset_types } = this._getAvailableAssets();
    let balance = null;

    // Estimate fee
    let fee = this.state.feeAmount.getAmount({ real: true });
    if (currentAccount && currentAccount.get("balances")) {
      let account_balances = currentAccount.get("balances").toJS();
      if (asset_types.length === 1) asset = ChainStore.getAsset(asset_types[0]);
      if (asset_types.length > 0) {
        let current_asset_id = asset ? asset.get("id") : asset_types[0];
        let feeID = feeAsset ? feeAsset.get("id") : "1.3.0";
        balance = (
          <span
            style={{ borderBottom: "#A09F9F 1px dotted", cursor: "pointer" }}
            onClick={this._setTotal.bind(
              this,
              current_asset_id,
              account_balances[current_asset_id],
              fee,
              feeID
            )}
          >
            <Translate component="span" content="transfer.available" />:{" "}
            {account_balances[current_asset_id] ? (
              <BalanceComponent balance={account_balances[current_asset_id]} />
            ) : (
              "0"
            )}
          </span>
        );
      } else {
        balance = "No funds";
      }
    }
    let crowd_asset =
      base_token && ChainStore.getAsset(base_token.toString().toUpperCase());

    const amountValue = parseFloat(
      String.prototype.replace.call(amount, /,/g, "")
    );
    const isAmountValid = amountValue && !isNaN(amountValue);
    const projectStat = getProjectStat(data, statusData);
    const isAmountIntTimes = new BigNumber(amountValue || 1)
      .mod(projectStat.precision)
      .isZero();
    const intTimeError = isAmountValid && !balanceError && !isAmountIntTimes;
    const avail = projectStat.pAvail;
    const isOverflow = amountValue > avail;
    const isTooLow = amountValue < base_min_quota;
    const isSendNotValid =
      !isAmountValid ||
      !asset ||
      balanceError ||
      !isAmountIntTimes ||
      isTooLow ||
      !isOpen ||
      isOverflow;
    return (
      <div
        className="join-wrapper"
        style={{
          margin: "auto",
          marginTop: "2rem",
          maxWidth: "48em",
          position: "relative"
        }}
      >
        <form
          style={{ paddingBottom: 20, overflow: "visible" }}
          onSubmit={this.onSubmit.bind(this)}
          noValidate
        >
          <Translate
            content="eto.crowd_project"
            component="h2"
            project={name}
            style={{ marginBottom: "2rem" }}
          />
          {/* Project Stat */}
          <div className="top-list">
            {/* <div>
                  <Translate
                    className="item-label"
                    content="eto.amount_remain"
                    component="td"
                  />
                  <td className="text-right" data-unit={base_token_name}>
                    {projectStat.amountRemained}
                  </td>
                </div> */}
            <div className="list-item">
              <Translate
                className="item-label"
                content="eto.account_limit_cap"
                component="span"
              />
              <span className="text-right" data-unit={base_token_name}>
                {base_max_quota}
              </span>
            </div>
            <div className="list-item">
              <Translate
                className="item-label"
                content="eto.account_limit_lower"
                component="span"
              />
              <span className="text-right" data-unit={base_token_name}>
                {base_min_quota}
              </span>
            </div>
            <div className="list-item">
              <Translate
                className="item-label"
                content="eto.account_limit_unit"
                component="span"
              />
              <span className="text-right" data-unit={base_token_name}>
                {projectStat.precision}
              </span>
            </div>
            <div className="list-item">
              <Translate
                className="item-label"
                content="eto.current_state_used"
                component="span"
              />
              <span className="text-right" data-unit={base_token_name}>
                {projectStat.pUsed}
              </span>
            </div>
            <div className="list-item">
              <Translate
                className="item-label"
                content="eto.current_state_avail"
                component="span"
              />
              <span className="text-right" data-unit={base_token_name}>
                {projectStat.pAvail}
              </span>
            </div>
          </div>
          <div className="content-block transfer-input">
            <AmountSelector
              label="transfer.amount"
              amount={amount}
              onChange={this.onAmountChanged.bind(this)}
              asset={crowd_asset && crowd_asset.get("id")}
              assets={[crowd_asset && crowd_asset.get("id")]}
              display_balance={balance}
            />
            <ErrorTipBox
              isI18n={true}
              tips={[
                {
                  name: "insufficient",
                  isError: this.state.balanceError,
                  isI18n: true,
                  message: "transfer.errors.insufficient"
                },
                {
                  name: "int_times",
                  isError: intTimeError,
                  isI18n: true,
                  message: "eto.int_times"
                },
                {
                  name: "too_low",
                  isError: isTooLow,
                  isI18n: true,
                  message: "eto.warning_lower"
                },
                {
                  name: "isOverflow",
                  isError: isOverflow,
                  isI18n: true,
                  message: "eto.warning_overflow"
                }
              ]}
              muiltTips={false}
            />
          </div>
          {/*  F E E   */}
          <div
            className={"content-block transfer-input"}
            style={{
              display: "flex",
              alignItems: "flex-end"
            }}
          >
            <AmountSelector
              refCallback={this.setNestedRef.bind(this)}
              label="transfer.fee"
              disabled={true}
              amount={fee}
              style={{ flex: 1, marginRight: "0.5em" }}
              onChange={this.onFeeChanged.bind(this)}
              asset={
                fee_asset_types.length && feeAmount
                  ? feeAmount.asset_id
                  : fee_asset_types.length === 1
                    ? fee_asset_types[0]
                    : fee_asset_id
                      ? fee_asset_id
                      : fee_asset_types[0]
              }
              assets={fee_asset_types}
              error={
                this.state.hasPoolBalance === false
                  ? "transfer.errors.insufficient"
                  : null
              }
            />

            <Button
              className={classnames("button float-right no-margin", {
                disabled: isSendNotValid || this.state.btnTimer > 0
              })}
              style={{ padding: "0 1em" }}
              disabled={isSendNotValid || this.state.btnTimer > 0}
              type="primary"
              value="Submit"
            >
              {this.state.btnTimer > 0 ? (
                <Translate
                  component="span"
                  content="eto.waiting"
                  timer={this.state.btnTimer}
                />
              ) : (
                <Translate component="span" content="eto.take_in" />
              )}
            </Button>
          </div>

          {/*  S E N D  B U T T O N  */}
          {error ? (
            <div className="content-block has-error">{error}</div>
          ) : null}
        </form>
        <ul
          className="illustration-list"
          style={{ color: Colors.$colorOrange, textAlign: "justify" }}
        >
          <Translate
            content="eto.cybex_in"
            component="li"
            asset={base_token_name}
          />
          {projectStat.isDelay ? (
            <li>
              <Translate
                content="eto.complete_offer"
                account={currentAccount && currentAccount.get("name")}
              />
              <span
                className="highlight tooltip"
                data-for="time"
                data-offset="{ 'left': -50 }"
                data-tip
                data-place="top"
              >
                {moment.utc(end_at).format("YYYY-MM-DD HH:mm:ss")}
              </span>
              <ReactTooltip id="time" effect="solid">
                <Translate content="eto.local_time" />：
                {moment
                  .utc(end_at)
                  .toDate()
                  .toString()}
              </ReactTooltip>
              <Translate
                content="eto.complete_tip_2"
                account={currentAccount && currentAccount.get("name")}
              />
            </li>
          ) : (
            <li>
              <Translate
                content="eto.complete_offer"
                account={currentAccount && currentAccount.get("name")}
              />
            </li>
          )}
          <Translate content="eto.overflow" unsafe component="li" />
          <Translate content="eto.be_patient" component="li" />
        </ul>
        {(!isOpen || !canJoin) && (
          <div
            className="closed-mask"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: Colors.$colorDark,
              opacity: 0.8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {canJoin &&
              !isOpen && (
                <Translate
                  component="h4"
                  content="eto.closed_tip"
                  project={name}
                />
              )}
            {!canJoin && (
              <Translate
                component="h4"
                content="eto.invalid_user"
                project={name}
              />
            )}
          </div>
        )}
      </div>
    );
  }
};
Join = BindToChainState(Join);

Join = connect(
  Join,
  {
    listenTo() {
      return [AccountStore];
    },
    getProps(props) {
      return {
        currentAccount: AccountStore.getState().currentAccount,
        passwordAccount: AccountStore.getState().passwordAccount
      };
    }
  }
);
export { Join };
export default Join;
