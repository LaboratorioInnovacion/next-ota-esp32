#pragma once

#include <WiFi.h>
#include <Preferences.h>
#include "CredentialStore.h"
#include "PortalRequest.h"
#include "PortalStream.h"
#include "CaptiveDnsSocket.h"
#include "ApPortalServer.h"

class WiFiProvisioning : private provisioning::Driver, private provisioning::Storage,
                         private provisioning::LocationStorage {
public:
  void setNetworks(const char* ssids[], const char* passwords[], int count);
  void begin();
  void loop();
  bool ready() const { return policy_.online() && WiFi.status() == WL_CONNECTED; }
  bool portalActive() const { return policy_.portal(); }
  const provisioning::Location& location() const { return location_.value(); }
  const char* stationName(const char* firmware) const { return stationName_.effective(firmware); }

private:
  void disconnect() override;
  void connect(size_t index, bool candidate) override;
  bool saveCandidate() override;
  bool startPortal() override;
  void stopPortal() override;
  void result(bool connected, bool saved) override;
  size_t read(size_t slot, provisioning::Credential& value) override;
  bool write(size_t slot, const provisioning::Credential& value) override;
  size_t readLocation(provisioning::LocationBlob& value) override;
  size_t writeLocation(const provisioning::LocationBlob& value) override;
  bool clearLocation() override;
  void serve();
  void respond(int code, const String& body);
  void asset(const char* body, size_t length, const char* type,
             const char* tail = nullptr, size_t tailLength = 0);
  void stream();
  bool setupPassword();
  const provisioning::Credential& known(size_t index) const;

  provisioning::Policy policy_;
  provisioning::SavedNetworks saved_;
  provisioning::Credential compiled_[provisioning::MaxNetworks]{};
  size_t compiledCount_ = 0;
  provisioning::Credential candidate_{}, attempted_{};
  Preferences preferences_;
  Preferences metadata_;
  bool metadataReady_ = false;
  provisioning::StationLocation location_;
  provisioning::Location pendingLocation_;
  provisioning::StationNameOverride stationName_;
  provisioning::StationName pendingName_;
  String formValues_;
  CaptiveDnsSocket dnsSocket_;
  provisioning::CaptiveDnsService<CaptiveDnsSocket> dns_;
  bool storageReady_ = false;
  String apPassword_, apName_, token_;
  ApPortalServer server_;
  WiFiClient browser_;
  char request_[provisioning::RequestLimit + 1]{};
  size_t requestSize_ = 0;
  uint32_t requestSince_ = 0;
  char responseHeader_[512]{};
  provisioning::ResponseStream response_;
  uint32_t responseSince_ = 0;
};
