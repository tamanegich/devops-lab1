#!/bin/bash
set -e

RUNNER_VERSION="2.322.0"
RUNNER_ARCH="x64"

RUNNER_USER="github-runner"
RUNNER_DIR="/opt/github-runner"

info()  { echo -e "\e[32m[INFO]\e[0m  $*"; }
error() { echo -e "\e[31m[ERROR]\e[0m $*"; exit 1; }

require_root() {
    [ "$EUID" -eq 0 ] || error "please run as root: sudo bash setup-runner.sh"
}

install_packages() {
    info "installing dependencies..."
    apt-get update -y
    apt-get install -y curl jq git docker.io openssh-client
    systemctl enable docker
    systemctl start docker
}

create_runner_user() {
    info "creating runner user..."
    if ! id "$RUNNER_USER" &>/dev/null; then
        useradd -m -s /bin/bash "$RUNNER_USER"
        info "created user: $RUNNER_USER"
    else
        info "user $RUNNER_USER already exists, skipping."
    fi
    usermod -aG docker "$RUNNER_USER"
}

download_runner() {
    info "downloading GitHub Actions runner v${RUNNER_VERSION}..."
    mkdir -p "$RUNNER_DIR"
    chown "$RUNNER_USER":"$RUNNER_USER" "$RUNNER_DIR"

    TARBALL="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
    curl -fsSL \
        "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}" \
        -o "/tmp/${TARBALL}"

    tar -xzf "/tmp/${TARBALL}" -C "$RUNNER_DIR"
    chown -R "$RUNNER_USER":"$RUNNER_USER" "$RUNNER_DIR"
    rm "/tmp/${TARBALL}"
    info "runner extracted to $RUNNER_DIR."
}

install_runner_dependencies() {
    info "installing runner dependencies..."
    "$RUNNER_DIR/bin/installdependencies.sh"
}

setup_ssh() {
    info "setting up SSH key for deployment access to target VM..."
    SSH_DIR="/home/${RUNNER_USER}/.ssh"
    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"

    if [ ! -f "${SSH_DIR}/id_ed25519" ]; then
        ssh-keygen -t ed25519 -f "${SSH_DIR}/id_ed25519" -N "" -C "github-runner"
        info "SSH key generated."
    else
        info "SSH key already exists, skipping."
    fi

    chown -R "$RUNNER_USER":"$RUNNER_USER" "$SSH_DIR"

    echo ""
    info "~~~ ACTION REQUIRED ~~~"
    info "Copy the following public key to ~/.ssh/authorized_keys on your target VM:"
    echo ""
    cat "${SSH_DIR}/id_ed25519.pub"
    echo ""
    info "Also add the private key (${SSH_DIR}/id_ed25519) as the SSH_PRIVATE_KEY"
    info "secret in your GitHub repository settings."
    echo ""
}

print_registration_instructions() {
    echo ""
    info "~~~ MANUAL STEP REQUIRED: REGISTER THE RUNNER ~~~"
    echo ""
    echo "  1. Go to your GitHub repository"
    echo "  2. Settings → Actions → Runners → New self-hosted runner"
    echo "  3. Copy the registration token from that page"
    echo "  4. Run the following commands:"
    echo ""
    echo "     su - ${RUNNER_USER}"
    echo "     cd ${RUNNER_DIR}"
    echo "     ./config.sh --url https://github.com/tamanegich/devops-labs --token <YOUR_TOKEN>"
    echo ""
    echo "  5. When prompted:"
    echo "       - Runner group: press Enter (default)"
    echo "       - Runner name:  choose any name (e.g. my-runner)"
    echo "       - Labels:       press Enter (default)"
    echo "       - Work folder:  press Enter (default)"
    echo ""
    echo "  6. Then install and start the runner as a service:"
    echo ""
    echo "     sudo ${RUNNER_DIR}/svc.sh install ${RUNNER_USER}"
    echo "     sudo ${RUNNER_DIR}/svc.sh start"
    echo ""
    info "After completing the steps above, the runner will appear as Online"
    info "in your repository's Settings → Actions → Runners page."
    echo ""
}

require_root
install_packages
create_runner_user
download_runner
install_runner_dependencies
setup_ssh
print_registration_instructions

info "><>    =======================    <><"
info "        runner setup complete        "
info "      complete the manual steps      "
info "><>    =======================    <><"
