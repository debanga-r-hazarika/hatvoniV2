Set WhatsApp Webhook (Panel)

# Set WhatsApp Webhook (Panel)

You can set a webhook URL to receive real-time WhatsApp delivery reports as a JSON POST object on the provided URL.

Set the webhook here:

Visit Fast2SMS Dev API section: [https://www.fast2sms.com/dashboard/dev-api](https://www.fast2sms.com/dashboard/dev-api) → Select "API Webhook" and below the "WhatsApp Webhook" tab, paste your webhook URL, and click "Save".

<Image border={false} src="https://files.readme.io/ad7fa866899d8d983e730c2cd7f1b4e51c8ede98868d592d3bd19ae49cfc3e4c-image.png" />

Example JSON Response

```
{
  "whatsapp_reports": [
    {
      "type": "incoming_message",
      "message_id": "wamid.ABCD1234",
      "phone_number_id": "123456789012345",
      "from": "919876543210",
      "timestamp": 1726642924,
      "message_type": "text",
      "body": "Hello, this is a customer response",
      "context": {
        "replied_to_message_id": "wamid.EFGH5678"
      }
    },
    {
      "type": "status_update",
      "request_id": "wamid.ABCD1234",
      "phone_number_id": "123456789012345",
      "recipient_id": "919876543210",
      "status": "delivered",
      "timestamp": 1726643040,
      "errors": null
    }
  ]
}
```

Get WhatsApp Webhook URL

# Get WhatsApp Webhook URL

Get saved WhatsApp webhook URL & its status: enable/disable

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/webhook/whatsapp/get": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsappwebhookget",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "return": {
                      "type": "string",
                      "default": "true"
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "webhook_url": {
                            "type": "string"
                          },
                          "webhook_status": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "webhook_url",
                          "webhook_status"
                        ]
                      }
                    }
                  },
                  "required": [
                    "return",
                    "data"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

Set WhatsApp Webhook URL

# Set WhatsApp Webhook URL

Update webhook URL or change status: enable/disable

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/webhook/whatsapp/set": {
      "post": {
        "description": "",
        "operationId": "post_devwhawsappwebhookset",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "message": {
                      "type": "string",
                      "default": "Webhook settings updated successfully"
                    }
                  },
                  "required": [
                    "message"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "header",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          }
        ],
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "webhook_url": {
                    "type": "string"
                  },
                  "webhook_status": {
                    "type": "string",
                    "enum": [
                      "enable",
                      "disable"
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

WhatsApp Logs

# WhatsApp Logs

You can fetch WhatsApp logs of the last 3 days using this API

Example JSON Response

```
{
  "success": true,
  "message": "Whatsapp Logs generated successfully.",
  "data": [
    {
      "type": "status_update",
      "request_id": "NlOPxxxxxxxxxxxx",
      "phone_number_id": "155xxxxxxxxxx",
      "recipient_id": "916xxxxxxxxx",
      "status": "delivered",
      "timestamp": "1763717022",
      "errors": null
    }
  ]
}
```

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp_logs": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsapp_logs",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "string",
                      "default": "true"
                    },
                    "message": {
                      "type": "string",
                      "default": "Whatsapp Logs generated successfully."
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "type": {
                            "type": "string",
                            "default": "status_update"
                          },
                          "request_id": {
                            "type": "string",
                            "default": ""
                          },
                          "phone_number_id": {
                            "type": "string"
                          },
                          "recipient_id": {
                            "type": "string"
                          },
                          "status": {
                            "type": "string"
                          },
                          "timestamp": {
                            "type": "string"
                          },
                          "errors": {
                            "type": "string"
                          }
                        },
                        "type": "object",
                        "required": [
                          "type",
                          "request_id",
                          "phone_number_id",
                          "recipient_id",
                          "status",
                          "timestamp",
                          "errors"
                        ]
                      }
                    }
                  },
                  "required": [
                    "success",
                    "message",
                    "data"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "from",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "required": true,
            "description": "Provide from date in format YYYY-MM-DD"
          },
          {
            "in": "query",
            "name": "to",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "required": true,
            "description": "Provide to date in format YYYY-MM-DD"
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

WhatsApp Logs Summary

# WhatsApp Logs Summary

Get WhatsApp logs summary for a 30-day interval

Example JSON Response

```
{
  "success": true,
  "message": "WhatsApp Summary fetched successfully.",
  "data": {
    "sent": 10,
    "accepted": 16,
    "delivered": 97,
    "read": 5,
    "failed": 3,
    "rejected": 0,
    "pending": 8
  }
}
```

<br />

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "WhatsApp API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/whatsapp_summary": {
      "get": {
        "description": "",
        "operationId": "get_devwhatsapp_summary",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "string",
                      "default": "true"
                    },
                    "message": {
                      "type": "string",
                      "default": "WhatsApp Summary fetched successfully."
                    },
                    "data": {
                      "type": "array",
                      "items": {
                        "properties": {
                          "sent": {
                            "type": "number"
                          },
                          "accepted": {
                            "type": "number"
                          },
                          "delivered": {
                            "type": "number"
                          },
                          "read": {
                            "type": "number"
                          },
                          "failed": {
                            "type": "number"
                          },
                          "rejected": {
                            "type": "number"
                          },
                          "pending": {
                            "type": "number"
                          }
                        },
                        "type": "object",
                        "required": [
                          "sent",
                          "accepted",
                          "delivered",
                          "read",
                          "failed",
                          "rejected",
                          "pending"
                        ]
                      }
                    }
                  },
                  "required": [
                    "success",
                    "message",
                    "data"
                  ]
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          },
          {
            "in": "query",
            "name": "from",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "required": true,
            "description": "Provide from date in format YYYY-MM-DD"
          },
          {
            "in": "query",
            "name": "to",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "required": true,
            "description": "Provide to date in format YYYY-MM-DD"
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```

Wallet Balance

# Wallet Balance

You can fetch your available Fast2SMS wallet balance using this GET API

<br />

# OpenAPI definition

```json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Wallet Balance API"
  },
  "servers": [
    {
      "url": "https://www.fast2sms.com"
    }
  ],
  "paths": {
    "/dev/wallet": {
      "get": {
        "description": "",
        "operationId": "get_devwallet",
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "return": {
                      "type": "string",
                      "default": "",
                      "description": "true"
                    },
                    "wallet": {
                      "type": "string",
                      "default": "",
                      "description": "5566.0100"
                    },
                    "sms_count": {
                      "type": "integer",
                      "default": "",
                      "description": "27830"
                    }
                  }
                }
              }
            }
          }
        },
        "parameters": [
          {
            "in": "query",
            "name": "authorization",
            "schema": {
              "type": "string",
              "default": "YOUR_API_KEY"
            },
            "required": true,
            "description": "Provide \"YOUR_API_KEY\"."
          }
        ]
      }
    }
  },
  "x-readme": {
    "explorer-enabled": true,
    "proxy-enabled": true
  }
}
```
